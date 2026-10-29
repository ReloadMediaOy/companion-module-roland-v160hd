'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const feedbacks = require('../src/feedbacks')
const variables = require('../src/variables')
const constants = require('../src/constants')

// ── shared test fixtures ──────────────────────────────────────────────────────

const CHOICES_MONITOR_ASSIGN = constants.CHOICES_MONITOR_ASSIGN
const CHOICES_OUTPUTS = [{ id: '00000A', label: 'HDMI Output 1' }]
const CHOICES_OUTPUTSASSIGN = [{ id: '00', label: 'Program' }]
const CHOICES_PGMPVW_SELECT = [{ id: '20', label: 'INPUT 1' }]
const CHOICES_PNPKEY_SOURCES = [{ id: '20', label: 'INPUT 1' }]

function makeFeedbackSelf(dataInit) {
	const defs = {}
	return Object.assign(Object.create(feedbacks), {
		DATA: Object.assign({}, dataInit),
		TALLYDATA: [{ id: '01', label: 'Input 1', shortlabel: 'IN1', status: 0 }],
		CHOICES_MONITOR_ASSIGN,
		CHOICES_PGMPVW_SELECT,
		CHOICES_OUTPUTS,
		CHOICES_OUTPUTSASSIGN,
		CHOICES_PNPKEY_SOURCES,
		log: () => {},
		setFeedbackDefinitions: (d) => Object.assign(defs, d),
		_defs: defs,
	})
}

function makeVariableSelf(dataInit) {
	const registered = []
	const result = { captured: undefined }
	return Object.assign(Object.create(variables), {
		DATA: Object.assign({}, dataInit),
		MODEL: '',
		VERSION: '',
		TALLYDATA: [],
		CHOICES_MONITOR_ASSIGN,
		CHOICES_PGMPVW_SELECT,
		CHOICES_OUTPUTSASSIGN,
		log: () => {},
		setVariableDefinitions: (d) => registered.push(...d),
		setVariableValues: (obj) => {
			result.captured = obj
		},
		_registered: registered,
		_result: result,
	})
}

// ── CHOICES_MONITOR_ASSIGN — shape verification ───────────────────────────────

describe('CHOICES_MONITOR_ASSIGN — constant shape', () => {
	test('has 12 entries', () => {
		assert.equal(CHOICES_MONITOR_ASSIGN.length, 12)
	})

	test('first entry is 00 = N/A', () => {
		assert.equal(CHOICES_MONITOR_ASSIGN[0].id, '00')
		assert.equal(CHOICES_MONITOR_ASSIGN[0].label, 'N/A')
	})

	test('Multi-View is 01', () => {
		const entry = CHOICES_MONITOR_ASSIGN.find((c) => c.id === '01')
		assert.equal(entry.label, 'Multi-View')
	})

	test('last entry is 0B = DSK 2 Source', () => {
		const last = CHOICES_MONITOR_ASSIGN[CHOICES_MONITOR_ASSIGN.length - 1]
		assert.equal(last.id, '0B')
		assert.equal(last.label, 'DSK 2 Source')
	})

	test('0A = DSK 1 Source', () => {
		const entry = CHOICES_MONITOR_ASSIGN.find((c) => c.id === '0A')
		assert.ok(entry, '0A not found')
		assert.equal(entry.label, 'DSK 1 Source')
	})

	test('all ids are uppercase hex strings', () => {
		for (const c of CHOICES_MONITOR_ASSIGN) {
			assert.match(c.id, /^[0-9A-F]{2}$/, `id ${c.id} is not uppercase 2-char hex`)
		}
	})
})

// ── monitorAssign feedback ────────────────────────────────────────────────────

describe('monitorAssign feedback — monitor 1', () => {
	test('returns true when monitor1assign matches', () => {
		const self = makeFeedbackSelf({ monitor1assign: '04' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '1', assign: '04' } }), true)
	})

	test('returns false when monitor1assign does not match', () => {
		const self = makeFeedbackSelf({ monitor1assign: '04' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '1', assign: '05' } }), false)
	})

	test('returns false when monitor1assign is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '1', assign: '04' } }), false)
	})
})

describe('monitorAssign feedback — all four monitors', () => {
	test('monitor 2 match', () => {
		const self = makeFeedbackSelf({ monitor2assign: '01' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '2', assign: '01' } }), true)
	})

	test('monitor 3 match', () => {
		const self = makeFeedbackSelf({ monitor3assign: '06' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '3', assign: '06' } }), true)
	})

	test('monitor 4 match', () => {
		const self = makeFeedbackSelf({ monitor4assign: '0B' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '4', assign: '0B' } }), true)
	})
})

describe('monitorAssign feedback — monitor isolation', () => {
	test('monitor 1 match does not trigger monitor 2 result', () => {
		const self = makeFeedbackSelf({ monitor1assign: '04', monitor2assign: '05' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '1', assign: '04' } }), true)
		assert.equal(cb({ options: { monitor: '2', assign: '04' } }), false)
	})
})

describe('monitorAssign feedback — 0A and 0B ids', () => {
	test('0A (DSK 1 Source) matches', () => {
		const self = makeFeedbackSelf({ monitor1assign: '0A' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '1', assign: '0A' } }), true)
	})

	test('0B (DSK 2 Source) matches', () => {
		const self = makeFeedbackSelf({ monitor2assign: '0B' })
		self.initFeedbacks()
		const cb = self._defs.monitorAssign.callback
		assert.equal(cb({ options: { monitor: '2', assign: '0B' } }), true)
	})
})

// ── initVariables — monitor variable registration ─────────────────────────────

describe('initVariables — monitor assign variables registered', () => {
	test('all four monitor variables are registered', () => {
		const self = makeVariableSelf({})
		self.initVariables()
		for (let m = 1; m <= 4; m++) {
			const id = `monitor${m}_assign`
			const def = self._registered.find((d) => d.variableId === id)
			assert.ok(def, `${id} not registered`)
			assert.equal(def.name, `Monitor ${m} Assignment`)
		}
	})
})

// ── checkVariables — monitor label lookup ─────────────────────────────────────

describe('checkVariables — monitor label lookup', () => {
	test('resolves known id to label for monitor 1', () => {
		const self = makeVariableSelf({ monitor1assign: '04' })
		self.checkVariables()
		assert.equal(self._result.captured.monitor1_assign, 'Program')
	})

	test('resolves Multi-View (01) for monitor 2', () => {
		const self = makeVariableSelf({ monitor2assign: '01' })
		self.checkVariables()
		assert.equal(self._result.captured.monitor2_assign, 'Multi-View')
	})

	test('resolves DSK 1 Source (0A) for monitor 3', () => {
		const self = makeVariableSelf({ monitor3assign: '0A' })
		self.checkVariables()
		assert.equal(self._result.captured.monitor3_assign, 'DSK 1 Source')
	})

	test('resolves DSK 2 Source (0B) for monitor 4', () => {
		const self = makeVariableSelf({ monitor4assign: '0B' })
		self.checkVariables()
		assert.equal(self._result.captured.monitor4_assign, 'DSK 2 Source')
	})

	test('falls back to raw hex for unknown id', () => {
		const self = makeVariableSelf({ monitor1assign: 'FF' })
		self.checkVariables()
		assert.equal(self._result.captured.monitor1_assign, 'FF')
	})

	test('passes undefined when monitor1assign is unset', () => {
		const self = makeVariableSelf({})
		self.checkVariables()
		assert.equal(self._result.captured.monitor1_assign, undefined)
	})

	test('all four monitors resolve independently', () => {
		const self = makeVariableSelf({
			monitor1assign: '04',
			monitor2assign: '06',
			monitor3assign: '07',
			monitor4assign: '09',
		})
		self.checkVariables()
		assert.equal(self._result.captured.monitor1_assign, 'Program')
		assert.equal(self._result.captured.monitor2_assign, 'Preview')
		assert.equal(self._result.captured.monitor3_assign, 'AUX 1')
		assert.equal(self._result.captured.monitor4_assign, 'AUX 3')
	})
})
