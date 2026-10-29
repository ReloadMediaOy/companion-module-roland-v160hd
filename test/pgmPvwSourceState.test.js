'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const feedbacks = require('../src/feedbacks')
const variables = require('../src/variables')

// ── shared test fixtures ──────────────────────────────────────────────────────

const CHOICES_PGMPVW_SELECT = [
	{ id: '20', label: 'INPUT 1' },
	{ id: '21', label: 'INPUT 2' },
	{ id: '00', label: 'HDMI 1' },
	{ id: '08', label: 'SDI 1' },
	{ id: '2A', label: 'INPUT 11' },
]

const CHOICES_OUTPUTS = [{ id: '00000A', label: 'HDMI Output 1' }]
const CHOICES_OUTPUTSASSIGN = [{ id: '00', label: 'Program' }]
const CHOICES_PNPKEY_SOURCES = [{ id: '20', label: 'INPUT 1' }]

// Build a self suitable for initFeedbacks(); captures all registered feedback defs.
function makeFeedbackSelf(dataInit) {
	const defs = {}
	return Object.assign(Object.create(feedbacks), {
		DATA: Object.assign({}, dataInit),
		TALLYDATA: [{ id: '01', label: 'Input 1', shortlabel: 'IN1', status: 0 }],
		CHOICES_PGMPVW_SELECT,
		CHOICES_OUTPUTS,
		CHOICES_OUTPUTSASSIGN,
		CHOICES_PNPKEY_SOURCES,
		log: () => {},
		setFeedbackDefinitions: (d) => Object.assign(defs, d),
		_defs: defs,
	})
}

// Build a self suitable for checkVariables(); result.captured holds the setVariableValues arg.
function makeVariableSelf(dataInit) {
	const registered = []
	const result = { captured: undefined }
	const self = Object.assign(Object.create(variables), {
		DATA: Object.assign({}, dataInit),
		MODEL: '',
		VERSION: '',
		TALLYDATA: [],
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
	return self
}

// ── pgmPvwSource feedback ─────────────────────────────────────────────────────

describe('pgmPvwSource feedback — PGM bus', () => {
	test('returns true when pgmsource matches', () => {
		const self = makeFeedbackSelf({ pgmsource: '20' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pgm', source: '20' } }), true)
	})

	test('returns false when pgmsource does not match', () => {
		const self = makeFeedbackSelf({ pgmsource: '20' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pgm', source: '21' } }), false)
	})

	test('returns false when pgmsource is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pgm', source: '20' } }), false)
	})
})

describe('pgmPvwSource feedback — PVW bus', () => {
	test('returns true when pvwsource matches', () => {
		const self = makeFeedbackSelf({ pvwsource: '21' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pvw', source: '21' } }), true)
	})

	test('returns false when pvwsource does not match', () => {
		const self = makeFeedbackSelf({ pvwsource: '21' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pvw', source: '20' } }), false)
	})

	test('returns false when pvwsource is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pvw', source: '21' } }), false)
	})
})

describe('pgmPvwSource feedback — bus isolation', () => {
	test('PGM match does not trigger PVW result', () => {
		const self = makeFeedbackSelf({ pgmsource: '20', pvwsource: '21' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pgm', source: '20' } }), true)
		assert.equal(cb({ options: { bus: 'pvw', source: '20' } }), false)
	})

	test('PVW match does not trigger PGM result', () => {
		const self = makeFeedbackSelf({ pgmsource: '20', pvwsource: '21' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pvw', source: '21' } }), true)
		assert.equal(cb({ options: { bus: 'pgm', source: '21' } }), false)
	})
})

describe('pgmPvwSource feedback — uppercase hex ids', () => {
	test('uppercase source id matches stored uppercase hex', () => {
		const self = makeFeedbackSelf({ pgmsource: '2A' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pgm', source: '2A' } }), true)
	})

	test('lowercase id from unknown source does not match', () => {
		const self = makeFeedbackSelf({ pgmsource: '2A' })
		self.initFeedbacks()
		const cb = self._defs.pgmPvwSource.callback
		assert.equal(cb({ options: { bus: 'pgm', source: '2a' } }), false)
	})
})

// ── initVariables — pgm_source and pvw_source are registered ─────────────────

describe('initVariables — pgm_source and pvw_source registered', () => {
	test('pgm_source definition registered', () => {
		const self = makeVariableSelf({})
		self.initVariables()
		const def = self._registered.find((d) => d.variableId === 'pgm_source')
		assert.ok(def, 'pgm_source not registered')
		assert.equal(def.name, 'PGM Current Source')
	})

	test('pvw_source definition registered', () => {
		const self = makeVariableSelf({})
		self.initVariables()
		const def = self._registered.find((d) => d.variableId === 'pvw_source')
		assert.ok(def, 'pvw_source not registered')
		assert.equal(def.name, 'PVW Current Source')
	})
})

// ── checkVariables — pgm_source label lookup ──────────────────────────────────

describe('checkVariables — pgm_source label lookup', () => {
	test('resolves known id to label', () => {
		const self = makeVariableSelf({ pgmsource: '20', pvwsource: '21' })
		self.checkVariables()
		assert.equal(self._result.captured.pgm_source, 'INPUT 1')
	})

	test('falls back to raw hex for unknown id', () => {
		const self = makeVariableSelf({ pgmsource: 'FF', pvwsource: '21' })
		self.checkVariables()
		assert.equal(self._result.captured.pgm_source, 'FF')
	})

	test('passes undefined when DATA.pgmsource is unset', () => {
		const self = makeVariableSelf({ pvwsource: '21' })
		self.checkVariables()
		assert.equal(self._result.captured.pgm_source, undefined)
	})
})

// ── checkVariables — pvw_source label lookup ──────────────────────────────────

describe('checkVariables — pvw_source label lookup', () => {
	test('resolves known id to label', () => {
		const self = makeVariableSelf({ pgmsource: '20', pvwsource: '21' })
		self.checkVariables()
		assert.equal(self._result.captured.pvw_source, 'INPUT 2')
	})

	test('falls back to raw hex for unknown id', () => {
		const self = makeVariableSelf({ pgmsource: '20', pvwsource: 'EE' })
		self.checkVariables()
		assert.equal(self._result.captured.pvw_source, 'EE')
	})

	test('passes undefined when DATA.pvwsource is unset', () => {
		const self = makeVariableSelf({ pgmsource: '20' })
		self.checkVariables()
		assert.equal(self._result.captured.pvw_source, undefined)
	})

	test('SDI and HDMI sources resolve to correct labels', () => {
		const self = makeVariableSelf({ pgmsource: '08', pvwsource: '00' })
		self.checkVariables()
		assert.equal(self._result.captured.pgm_source, 'SDI 1')
		assert.equal(self._result.captured.pvw_source, 'HDMI 1')
	})
})
