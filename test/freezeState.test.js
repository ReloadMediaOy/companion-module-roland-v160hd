'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const feedbacks = require('../src/feedbacks')
const variables = require('../src/variables')

const CHOICES_OUTPUTS = [{ id: '00000A', label: 'HDMI Output 1' }]
const CHOICES_OUTPUTSASSIGN = [{ id: '00', label: 'Program' }]
const CHOICES_PGMPVW_SELECT = [{ id: '20', label: 'INPUT 1' }]
const CHOICES_PNPKEY_SOURCES = [{ id: '20', label: 'INPUT 1' }]

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

function makeVariableSelf(dataInit) {
	const registered = []
	const result = { captured: undefined }
	return Object.assign(Object.create(variables), {
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
}

// ── freezeType feedback ───────────────────────────────────────────────────────

describe('freezeType feedback — All', () => {
	test('returns true when freeze_type is 00 and option is All', () => {
		const self = makeFeedbackSelf({ freeze_type: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeType.callback
		assert.equal(cb({ options: { type: '00' } }), true)
	})

	test('returns false when freeze_type is 00 and option is Select', () => {
		const self = makeFeedbackSelf({ freeze_type: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeType.callback
		assert.equal(cb({ options: { type: '01' } }), false)
	})
})

describe('freezeType feedback — Select', () => {
	test('returns true when freeze_type is 01 and option is Select', () => {
		const self = makeFeedbackSelf({ freeze_type: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeType.callback
		assert.equal(cb({ options: { type: '01' } }), true)
	})

	test('returns false when freeze_type is 01 and option is All', () => {
		const self = makeFeedbackSelf({ freeze_type: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeType.callback
		assert.equal(cb({ options: { type: '00' } }), false)
	})
})

describe('freezeType feedback — missing DATA', () => {
	test('returns false when freeze_type is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.freezeType.callback
		assert.equal(cb({ options: { type: '00' } }), false)
	})

	test('returns false for Select option when freeze_type is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.freezeType.callback
		assert.equal(cb({ options: { type: '01' } }), false)
	})
})

// ── freezeSelectInput feedback — HDMI ─────────────────────────────────────────

describe('freezeSelectInput feedback — HDMI representative', () => {
	test('returns true when HDMI IN 1 (02) is enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_02: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '02', state: '01' } }), true)
	})

	test('returns false when HDMI IN 1 (02) is disabled and Enable is checked', () => {
		const self = makeFeedbackSelf({ freeze_select_02: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '02', state: '01' } }), false)
	})

	test('returns true when checking Disable state and input is disabled', () => {
		const self = makeFeedbackSelf({ freeze_select_02: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '02', state: '00' } }), true)
	})
})

// ── freezeSelectInput feedback — SDI ─────────────────────────────────────────

describe('freezeSelectInput feedback — SDI representative', () => {
	test('returns true when SDI IN 1 (0A) is enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_0A: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '0A', state: '01' } }), true)
	})

	test('returns false when SDI IN 1 (0A) is disabled and Enable is checked', () => {
		const self = makeFeedbackSelf({ freeze_select_0A: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '0A', state: '01' } }), false)
	})

	test('returns true for SDI IN 4 (0D) enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_0D: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '0D', state: '01' } }), true)
	})
})

// ── freezeSelectInput feedback — boundary inputs ──────────────────────────────

describe('freezeSelectInput feedback — boundary inputs', () => {
	test('boundary 02 (HDMI IN 1) enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_02: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '02', state: '01' } }), true)
	})

	test('boundary 09 (HDMI IN 8) enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_09: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '09', state: '01' } }), true)
	})

	test('boundary 0A (SDI IN 1) enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_0A: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '0A', state: '01' } }), true)
	})

	test('boundary 11 (SDI IN 8) enabled', () => {
		const self = makeFeedbackSelf({ freeze_select_11: '01' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '11', state: '01' } }), true)
	})
})

// ── freezeSelectInput feedback — input isolation ──────────────────────────────

describe('freezeSelectInput feedback — input isolation', () => {
	test('02 enabled does not affect 03 result', () => {
		const self = makeFeedbackSelf({ freeze_select_02: '01', freeze_select_03: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '02', state: '01' } }), true)
		assert.equal(cb({ options: { input: '03', state: '01' } }), false)
	})

	test('0A enabled does not affect 0B result', () => {
		const self = makeFeedbackSelf({ freeze_select_0A: '01', freeze_select_0B: '00' })
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '0A', state: '01' } }), true)
		assert.equal(cb({ options: { input: '0B', state: '01' } }), false)
	})
})

// ── freezeSelectInput feedback — missing select DATA ─────────────────────────

describe('freezeSelectInput feedback — missing DATA', () => {
	test('returns false when freeze_select_02 is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '02', state: '01' } }), false)
	})

	test('returns false when freeze_select_0A is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.freezeSelectInput.callback
		assert.equal(cb({ options: { input: '0A', state: '01' } }), false)
	})
})

// ── initVariables — freeze_type registration ─────────────────────────────────

describe('initVariables — freeze_type registered', () => {
	test('freeze_type variable is registered', () => {
		const self = makeVariableSelf({})
		self.initVariables()
		const def = self._registered.find((d) => d.variableId === 'freeze_type')
		assert.ok(def, 'freeze_type not registered')
		assert.equal(def.name, 'Freeze Type')
	})
})

// ── checkVariables — freeze_type label lookup ─────────────────────────────────

describe('checkVariables — freeze_type label lookup', () => {
	test("resolves '00' to All", () => {
		const self = makeVariableSelf({ freeze_type: '00' })
		self.checkVariables()
		assert.equal(self._result.captured.freeze_type, 'All')
	})

	test("resolves '01' to Select", () => {
		const self = makeVariableSelf({ freeze_type: '01' })
		self.checkVariables()
		assert.equal(self._result.captured.freeze_type, 'Select')
	})

	test('falls back to raw hex for unknown id', () => {
		const self = makeVariableSelf({ freeze_type: 'FF' })
		self.checkVariables()
		assert.equal(self._result.captured.freeze_type, 'FF')
	})

	test('passes undefined when freeze_type is unset', () => {
		const self = makeVariableSelf({})
		self.checkVariables()
		assert.equal(self._result.captured.freeze_type, undefined)
	})
})
