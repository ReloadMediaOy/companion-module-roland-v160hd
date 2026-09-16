'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const BASE_STUB = {
	InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected', Error: 'error' },
	TCPHelper: class {},
	combineRgb: (r, g, b) => (r << 16) | (g << 8) | b,
}
let baseResolved
try {
	baseResolved = require.resolve('@companion-module/base')
} catch (_) {
	baseResolved = null
}
if (baseResolved) {
	require.cache[baseResolved] = {
		id: baseResolved,
		filename: baseResolved,
		loaded: true,
		exports: BASE_STUB,
	}
}

const api = require('../src/api')
const feedbacksDef = require('../src/feedbacks')
const constants = require('../src/constants')

// Build a module instance stub and capture the auxTally callback via setFeedbackDefinitions.
function makeInstance(dataOverrides) {
	const self = {
		config: { verbose: false },
		DATA: Object.assign({ inputAssign: new Array(20).fill(undefined) }, dataOverrides || {}),
		log: () => {},
		logVerbose: () => {},
		setVariableValues: () => {},
		checkFeedbacks: () => {},
		checkVariables: () => {},
		TALLYDATA: constants.TALLYDATA.map((t) => Object.assign({}, t)),
		CHOICES_PGMPVW_SELECT: constants.CHOICES_PGMPVW_SELECT,
		CHOICES_PNPKEY_SOURCES: constants.CHOICES_PNPKEY_SOURCES,
		CHOICES_OUTPUTS: constants.CHOICES_OUTPUTS,
		CHOICES_OUTPUTSASSIGN: constants.CHOICES_OUTPUTSASSIGN || [{ id: '00', label: 'Placeholder' }],
		_parseHexBlock: api._parseHexBlock,
		_resolveInputToPhysical: api._resolveInputToPhysical,
	}

	let auxTallyCallback
	self.setFeedbackDefinitions = (defs) => {
		auxTallyCallback = defs.auxTally.callback
	}
	feedbacksDef.initFeedbacks.call(self)
	self._auxTally = auxTallyCallback
	return self
}

function auxTally(self, aux, assign) {
	return self._auxTally({ options: { aux, assign } }, {})
}

// Feed a DTH message directly to updateData.
function feedDTH(self, dth) {
	api.updateData.call(self, dth + ';')
}

// ── VIDEO ASSIGN DTH parsing ─────────────────────────────────────────────────

describe('VIDEO ASSIGN DTH parsing', () => {
	test('10-byte block at 000000 populates inputAssign[0..9]', () => {
		const self = { ...makeInstance(), sendRawCommand: () => {} }
		// INPUT 1 → HDMI 1 (00), INPUT 2 → HDMI 2 (01), … INPUT 6 → HDMI 6 (05), …
		const block = '00010203040506070809'
		feedDTH(self, 'DTH:000000,' + block)
		assert.deepEqual(self.DATA.inputAssign.slice(0, 10), ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09'])
	})

	test('10-byte block at 000024 populates inputAssign[10..19]', () => {
		const self = { ...makeInstance(), sendRawCommand: () => {} }
		const block = '0A0B0C0D0E0F101112FF'
		feedDTH(self, 'DTH:000024,' + block)
		assert.deepEqual(self.DATA.inputAssign.slice(10, 20), ['0A', '0B', '0C', '0D', '0E', '0F', '10', '11', '12', 'FF'])
	})

	test('000000 block leaves inputAssign[10..19] unchanged', () => {
		const self = { ...makeInstance(), sendRawCommand: () => {} }
		// Preset INPUT 11 slot
		self.DATA.inputAssign[10] = '08'
		feedDTH(self, 'DTH:000000,' + '00'.repeat(10))
		assert.equal(self.DATA.inputAssign[10], '08')
	})

	test('malformed 000000 block (invalid hex) does not overwrite inputAssign', () => {
		const self = { ...makeInstance(), sendRawCommand: () => {} }
		feedDTH(self, 'DTH:000000,' + '00010203040506070809')
		const before = [...self.DATA.inputAssign.slice(0, 10)]
		// Feed non-hex / wrong-length value — must not change state
		feedDTH(self, 'DTH:000000,ZZZZZZZZZZZZZZZZZZZZ')
		assert.deepEqual(self.DATA.inputAssign.slice(0, 10), before)
	})

	test('malformed 000000 block (wrong length) does not partially overwrite', () => {
		const self = { ...makeInstance(), sendRawCommand: () => {} }
		feedDTH(self, 'DTH:000000,' + '05'.repeat(10)) // set all INPUT 1-10 → HDMI 6
		const before = [...self.DATA.inputAssign.slice(0, 10)]
		// 9-byte block (18 hex chars) — wrong length, not 1 byte and not 10 bytes
		feedDTH(self, 'DTH:000000,' + '01'.repeat(9))
		assert.deepEqual(self.DATA.inputAssign.slice(0, 10), before)
	})
})

// ── _resolveInputToPhysical ──────────────────────────────────────────────────

describe('_resolveInputToPhysical', () => {
	test('returns physical assignment for INPUT 1 (20)', () => {
		const self = makeInstance()
		self.DATA.inputAssign[0] = '00' // INPUT 1 → HDMI 1
		assert.equal(api._resolveInputToPhysical.call(self, '20'), '00')
	})

	test('returns physical assignment for INPUT 6 (25) → HDMI 6 (05)', () => {
		const self = makeInstance()
		self.DATA.inputAssign[5] = '05'
		assert.equal(api._resolveInputToPhysical.call(self, '25'), '05')
	})

	test('returns rawId uppercased for physical source (no INPUT mapping)', () => {
		const self = makeInstance()
		assert.equal(api._resolveInputToPhysical.call(self, '05'), '05')
	})

	test('falls back to rawId when inputAssign slot is undefined', () => {
		const self = makeInstance()
		// inputAssign[5] stays undefined
		assert.equal(api._resolveInputToPhysical.call(self, '25'), '25')
	})

	test('falls back to rawId when inputAssign is not set at all', () => {
		const self = makeInstance()
		self.DATA.inputAssign = null
		assert.equal(api._resolveInputToPhysical.call(self, '25'), '25')
	})
})

// ── auxTally feedback with physical source resolution ────────────────────────

describe('auxTally feedback — physical source resolution', () => {
	test('direct HDMI source match still works without inputAssign', () => {
		const self = makeInstance({ aux1source: '05' })
		assert.equal(auxTally(self, 'aux1', '05'), true)
		assert.equal(auxTally(self, 'aux1', '04'), false)
	})

	test('INPUT6 (25) → HDMI6 (05): both INPUT6 and HDMI6 feedbacks are true', () => {
		const self = makeInstance({ aux1source: '25' })
		self.DATA.inputAssign[5] = '05' // INPUT 6 → HDMI 6
		assert.equal(auxTally(self, 'aux1', '25'), true, 'INPUT 6 direct match')
		assert.equal(auxTally(self, 'aux1', '05'), true, 'HDMI 6 via assignment')
	})

	test('changing INPUT6 assignment from HDMI6 to SDI1 updates effective feedback', () => {
		const self = makeInstance({ aux1source: '25' })
		self.DATA.inputAssign[5] = '05' // INPUT 6 → HDMI 6
		assert.equal(auxTally(self, 'aux1', '05'), true)

		self.DATA.inputAssign[5] = '08' // INPUT 6 → SDI 1
		assert.equal(auxTally(self, 'aux1', '05'), false, 'HDMI 6 no longer active')
		assert.equal(auxTally(self, 'aux1', '08'), true, 'SDI 1 now active')
	})

	test('unrelated HDMI feedbacks stay false when INPUT6→HDMI6', () => {
		const self = makeInstance({ aux1source: '25' })
		self.DATA.inputAssign[5] = '05' // INPUT 6 → HDMI 6
		assert.equal(auxTally(self, 'aux1', '04'), false, 'HDMI 5 must be false')
		assert.equal(auxTally(self, 'aux1', '06'), false, 'HDMI 7 must be false')
	})

	test('INPUT source feedback does not resolve through assignment (exact match only)', () => {
		const self = makeInstance({ aux1source: '05' }) // HDMI 6 directly
		self.DATA.inputAssign[5] = '05' // INPUT 6 also points to HDMI 6
		// Feedback for INPUT 6 (25) must NOT match when raw source is HDMI 6 (05)
		assert.equal(auxTally(self, 'aux1', '25'), false, 'INPUT 6 feedback must not match HDMI 6 raw source')
	})

	test('AUX2 and AUX3 channels resolve independently', () => {
		const self = makeInstance({ aux1source: '20', aux2source: '25', aux3source: '22' })
		self.DATA.inputAssign[0] = '00' // INPUT 1 → HDMI 1
		self.DATA.inputAssign[5] = '05' // INPUT 6 → HDMI 6
		self.DATA.inputAssign[2] = '0A' // INPUT 3 → SDI 3

		assert.equal(auxTally(self, 'aux1', '00'), true, 'AUX1: INPUT 1 via HDMI 1')
		assert.equal(auxTally(self, 'aux2', '05'), true, 'AUX2: INPUT 6 via HDMI 6')
		assert.equal(auxTally(self, 'aux3', '0A'), true, 'AUX3: INPUT 3 via SDI 3')
		assert.equal(auxTally(self, 'aux1', '05'), false, 'AUX1: HDMI 6 must be false')
	})
})

// ── getVideoAssign emits correct RQH commands ────────────────────────────────

describe('getVideoAssign RQH commands', () => {
	test('emits two RQH queries covering INPUT 1–10 and INPUT 11–20', () => {
		const cmds = []
		const self = { sendRawCommand: (cmd) => cmds.push(cmd) }
		api.getVideoAssign.call(self)
		assert.ok(cmds.some((c) => c.includes('RQH:000000,00000A')), 'INPUT 1–10 query')
		assert.ok(cmds.some((c) => c.includes('RQH:000024,00000A')), 'INPUT 11–20 query')
		assert.equal(cmds.length, 2)
	})
})
