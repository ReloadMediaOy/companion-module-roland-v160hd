'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const api = require('../src/api.js')
const actions = require('../src/actions.js')
const constants = require('../src/constants.js')
const presets = require('../src/presets.js')
const { extractMessages } = require('../src/tcpParser.js')

const TAKE_ACTIONS = [
	{ id: 'cut_take', address: '0B001E' },
	{ id: 'auto_take', address: '0B001F' },
]
const SOURCE_READS = ['RQH:002100,000002;\n', 'RQH:000011,000001;\n', 'RQH:00002E,000002;\n']

// Exercise real action callbacks, priority queue, framing and parser. Only the
// network boundary and Companion publication methods are replaced; no TCPHelper
// is created, including in the empty-host connection teardown tests.
function makeInstance(t) {
	t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setImmediate'], now: 1000 })
	const sent = []
	const publications = []
	const logs = []
	const instance = {
		...constants,
		...api,
		...actions,
		...presets,
		DATA: { pgm_source: '00', pvw_source: '01' },
		config: { host: '', verbose: false },
		_highQueue: [],
		_lowQueue: [],
		_drainScheduled: false,
		_drainGeneration: 0,
		socket: {
			isConnected: true,
			destroyed: false,
			send(raw) {
				sent.push({ raw, at: Date.now() })
			},
			destroy() {
				this.isConnected = false
				this.destroyed = true
			},
		},
		log(level, message) {
			logs.push({ level, message })
		},
		setActionDefinitions(definitions) {
			this.actionDefinitions = definitions
		},
		setPresetDefinitions(_structure, definitions) {
			this.presetDefinitions = definitions
		},
		checkFeedbacks(...ids) {
			publications.push({ kind: 'feedbacks', ids, data: { ...this.DATA } })
		},
		checkAllFeedbacks() {
			publications.push({ kind: 'feedbacks', data: { ...this.DATA } })
		},
		checkVariables() {
			publications.push({ kind: 'variables', data: { ...this.DATA } })
		},
	}
	instance.initActions()
	t.after(() => {
		instance._clearQueue()
		t.mock.timers.reset()
	})
	return { instance, sent, publications, logs }
}

function invoke(instance, id) {
	instance.actionDefinitions[id].callback({ options: {} })
}

function wireCommands(sent) {
	return sent.map(({ raw }) => raw)
}

describe('CUT and AUTO Take actions', () => {
	for (const { id, address } of TAKE_ACTIONS) {
		test(`${id} sends a rate-limited press/release before queued reads`, (t) => {
			const { instance, sent } = makeInstance(t)
			// A queued poll must not get between either high-priority write.
			instance.sendRawCommand('RQH:001B00,000002;')
			invoke(instance, id)
			assert.deepEqual(sent, [], 'the action must use the queue, not send directly')

			t.mock.timers.tick(0)
			assert.deepEqual(sent, [{ raw: `DTH:${address},01;\n`, at: 1000 }])
			t.mock.timers.tick(19)
			assert.equal(sent.length, 1, 'release must respect the existing 20 ms write interval')
			t.mock.timers.tick(1)
			assert.deepEqual(sent, [
				{ raw: `DTH:${address},01;\n`, at: 1000 },
				{ raw: `DTH:${address},00;\n`, at: 1020 },
			])
			t.mock.timers.tick(20)
			assert.deepEqual(wireCommands(sent).slice(2), ['RQH:001B00,000002;\n', ...SOURCE_READS])
		})

		test(`${id} preserves two complete pulses when pressed twice before draining`, (t) => {
			const { instance, sent } = makeInstance(t)
			invoke(instance, id)
			invoke(instance, id)
			t.mock.timers.tick(0)
			for (let i = 0; i < 3; i++) t.mock.timers.tick(20)
			assert.deepEqual(sent, [
				{ raw: `DTH:${address},01;\n`, at: 1000 },
				{ raw: `DTH:${address},00;\n`, at: 1020 },
				{ raw: `DTH:${address},01;\n`, at: 1040 },
				{ raw: `DTH:${address},00;\n`, at: 1060 },
			])
			t.mock.timers.tick(20)
			assert.deepEqual(wireCommands(sent).slice(4), SOURCE_READS, 'source reads remain debounced')
		})

		test(`${id} leaves bus state unchanged until a real device response is parsed`, (t) => {
			const { instance, sent, publications, logs } = makeInstance(t)
			invoke(instance, id)
			t.mock.timers.tick(0)
			t.mock.timers.tick(20)
			t.mock.timers.tick(20)
			assert.equal(sent.length, 5, 'both writes and source reads have left the queue')
			assert.deepEqual(instance.DATA, { pgm_source: '00', pvw_source: '01' })
			assert.deepEqual(publications, [], 'sending a take must not publish a guessed bus state')

			const { messages, remaining } = extractMessages('DTH:002100,0100;\n')
			assert.equal(remaining, '')
			assert.equal(messages.length, 1)
			for (const message of messages) instance.updateData(message)
			assert.deepEqual(
				logs.filter(({ level }) => level === 'error'),
				[],
			)
			assert.deepEqual(instance.DATA, { pgm_source: '01', pvw_source: '00' })
			t.mock.timers.tick(40)
			assert.deepEqual(publications, [
				{ kind: 'feedbacks', data: { pgm_source: '01', pvw_source: '00' } },
				{ kind: 'variables', data: { pgm_source: '01', pvw_source: '00' } },
			])
		})

		test(`${id} cannot send an old queued release through a replacement connection`, (t) => {
			const { instance, sent } = makeInstance(t)
			invoke(instance, id)
			t.mock.timers.tick(0)
			assert.deepEqual(wireCommands(sent), [`DTH:${address},01;\n`])
			const oldSocket = instance.socket
			instance.initConnection() // host is empty: real teardown, no network connection
			assert.equal(oldSocket.destroyed, true)
			assert.equal(instance.socket, undefined)

			const replacementSent = []
			instance.socket = { isConnected: true, send: (raw) => replacementSent.push(raw) }
			for (let i = 0; i < 15; i++) t.mock.timers.tick(20)
			assert.deepEqual(replacementSent, [], 'neither a stale release nor stale source reads may leak')
			assert.deepEqual(wireCommands(sent), [`DTH:${address},01;\n`])
		})

		test(`${id} preset still works with its existing down-only action binding`, (t) => {
			const { instance, sent } = makeInstance(t)
			instance.initPresets()
			const preset = instance.presetDefinitions[id]
			assert.deepEqual(preset.steps, [{ down: [{ actionId: id, options: {} }], up: [] }])
			assert.deepEqual(instance.actionDefinitions[id].options, [])
			for (const action of preset.steps[0].down) instance.actionDefinitions[action.actionId].callback(action)
			t.mock.timers.tick(0)
			t.mock.timers.tick(20)
			assert.deepEqual(wireCommands(sent), [`DTH:${address},01;\n`, `DTH:${address},00;\n`])
		})
	}

	test('CUT followed immediately by AUTO keeps each press paired with its own release', (t) => {
		const { instance, sent } = makeInstance(t)
		invoke(instance, 'cut_take')
		invoke(instance, 'auto_take')
		t.mock.timers.tick(0)
		for (let i = 0; i < 3; i++) t.mock.timers.tick(20)
		assert.deepEqual(wireCommands(sent), [
			'DTH:0B001E,01;\n',
			'DTH:0B001E,00;\n',
			'DTH:0B001F,01;\n',
			'DTH:0B001F,00;\n',
		])
	})
})
