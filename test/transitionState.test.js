'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const feedbacks = require('../src/feedbacks')
const variables = require('../src/variables')
const constants = require('../src/constants')

// ── shared test fixtures ──────────────────────────────────────────────────────

const CHOICES_TRANSITION_TYPES = constants.CHOICES_TRANSITION_TYPES
const CHOICES_MIX_TYPES = constants.CHOICES_MIX_TYPES
const CHOICES_WIPE_TYPES = constants.CHOICES_WIPE_TYPES
const CHOICES_WIPE_DIRECTIONS = constants.CHOICES_WIPE_DIRECTIONS
const CHOICES_OUTPUTS = [{ id: '00000A', label: 'HDMI Output 1' }]
const CHOICES_OUTPUTSASSIGN = [{ id: '00', label: 'Program' }]
const CHOICES_PGMPVW_SELECT = [{ id: '20', label: 'INPUT 1' }]
const CHOICES_PNPKEY_SOURCES = [{ id: '20', label: 'INPUT 1' }]

function makeFeedbackSelf(dataInit) {
	const defs = {}
	return Object.assign(Object.create(feedbacks), {
		DATA: Object.assign({}, dataInit),
		TALLYDATA: [{ id: '01', label: 'Input 1', shortlabel: 'IN1', status: 0 }],
		CHOICES_TRANSITION_TYPES,
		CHOICES_MIX_TYPES,
		CHOICES_WIPE_TYPES,
		CHOICES_WIPE_DIRECTIONS,
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
		CHOICES_TRANSITION_TYPES,
		CHOICES_MIX_TYPES,
		CHOICES_WIPE_TYPES,
		CHOICES_WIPE_DIRECTIONS,
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

// ── transitionType feedback ───────────────────────────────────────────────────

describe('transitionType feedback — match and non-match', () => {
	test('returns true when transitiontype matches (Mix = 0)', () => {
		const self = makeFeedbackSelf({ transitiontype: 0 })
		self.initFeedbacks()
		const cb = self._defs.transitionType.callback
		assert.equal(cb({ options: { type: 0 } }), true)
	})

	test('returns true when transitiontype matches (Wipe = 1)', () => {
		const self = makeFeedbackSelf({ transitiontype: 1 })
		self.initFeedbacks()
		const cb = self._defs.transitionType.callback
		assert.equal(cb({ options: { type: 1 } }), true)
	})

	test('returns false when transitiontype does not match', () => {
		const self = makeFeedbackSelf({ transitiontype: 0 })
		self.initFeedbacks()
		const cb = self._defs.transitionType.callback
		assert.equal(cb({ options: { type: 1 } }), false)
	})

	test('returns false when transitiontype is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.transitionType.callback
		assert.equal(cb({ options: { type: 0 } }), false)
	})
})

// ── mixType feedback ──────────────────────────────────────────────────────────

describe('mixType feedback — match and non-match', () => {
	test('returns true when mixtype matches (Mix = 0)', () => {
		const self = makeFeedbackSelf({ mixtype: 0 })
		self.initFeedbacks()
		const cb = self._defs.mixType.callback
		assert.equal(cb({ options: { type: 0 } }), true)
	})

	test('returns true when mixtype matches (Nam = 2)', () => {
		const self = makeFeedbackSelf({ mixtype: 2 })
		self.initFeedbacks()
		const cb = self._defs.mixType.callback
		assert.equal(cb({ options: { type: 2 } }), true)
	})

	test('returns false when mixtype does not match', () => {
		const self = makeFeedbackSelf({ mixtype: 1 })
		self.initFeedbacks()
		const cb = self._defs.mixType.callback
		assert.equal(cb({ options: { type: 2 } }), false)
	})

	test('returns false when mixtype is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.mixType.callback
		assert.equal(cb({ options: { type: 0 } }), false)
	})
})

// ── wipeType feedback ─────────────────────────────────────────────────────────

describe('wipeType feedback — match and non-match', () => {
	test('returns true when wipetype matches (Horizontal = 0)', () => {
		const self = makeFeedbackSelf({ wipetype: 0 })
		self.initFeedbacks()
		const cb = self._defs.wipeType.callback
		assert.equal(cb({ options: { type: 0 } }), true)
	})

	test('returns true when wipetype matches (V-Center = 7)', () => {
		const self = makeFeedbackSelf({ wipetype: 7 })
		self.initFeedbacks()
		const cb = self._defs.wipeType.callback
		assert.equal(cb({ options: { type: 7 } }), true)
	})

	test('returns false when wipetype does not match', () => {
		const self = makeFeedbackSelf({ wipetype: 3 })
		self.initFeedbacks()
		const cb = self._defs.wipeType.callback
		assert.equal(cb({ options: { type: 5 } }), false)
	})

	test('returns false when wipetype is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.wipeType.callback
		assert.equal(cb({ options: { type: 0 } }), false)
	})
})

// ── wipeDirection feedback ────────────────────────────────────────────────────

describe('wipeDirection feedback — match and non-match', () => {
	test('returns true when wipedirection matches (Normal = 0)', () => {
		const self = makeFeedbackSelf({ wipedirection: 0 })
		self.initFeedbacks()
		const cb = self._defs.wipeDirection.callback
		assert.equal(cb({ options: { direction: 0 } }), true)
	})

	test('returns true when wipedirection matches (Round Trip = 2)', () => {
		const self = makeFeedbackSelf({ wipedirection: 2 })
		self.initFeedbacks()
		const cb = self._defs.wipeDirection.callback
		assert.equal(cb({ options: { direction: 2 } }), true)
	})

	test('returns false when wipedirection does not match', () => {
		const self = makeFeedbackSelf({ wipedirection: 0 })
		self.initFeedbacks()
		const cb = self._defs.wipeDirection.callback
		assert.equal(cb({ options: { direction: 1 } }), false)
	})

	test('returns false when wipedirection is undefined', () => {
		const self = makeFeedbackSelf({})
		self.initFeedbacks()
		const cb = self._defs.wipeDirection.callback
		assert.equal(cb({ options: { direction: 0 } }), false)
	})
})

// ── cross-field isolation ─────────────────────────────────────────────────────

describe('feedback cross-field isolation', () => {
	test('transitiontype match does not affect mixType result', () => {
		const self = makeFeedbackSelf({ transitiontype: 0, mixtype: 1 })
		self.initFeedbacks()
		assert.equal(self._defs.transitionType.callback({ options: { type: 0 } }), true)
		assert.equal(self._defs.mixType.callback({ options: { type: 0 } }), false)
	})

	test('wipetype match does not affect wipeDirection result', () => {
		const self = makeFeedbackSelf({ wipetype: 2, wipedirection: 1 })
		self.initFeedbacks()
		assert.equal(self._defs.wipeType.callback({ options: { type: 2 } }), true)
		assert.equal(self._defs.wipeDirection.callback({ options: { direction: 2 } }), false)
	})

	test('integer 0 matches only where DATA field is 0', () => {
		const self = makeFeedbackSelf({ transitiontype: 0, mixtype: 1, wipetype: 2, wipedirection: 1 })
		self.initFeedbacks()
		assert.equal(self._defs.transitionType.callback({ options: { type: 0 } }), true)
		assert.equal(self._defs.mixType.callback({ options: { type: 0 } }), false)
		assert.equal(self._defs.wipeType.callback({ options: { type: 0 } }), false)
		assert.equal(self._defs.wipeDirection.callback({ options: { direction: 0 } }), false)
	})
})

// ── initVariables — transition variable registration ──────────────────────────

describe('initVariables — transition variables registered', () => {
	test('all four transition variables are registered', () => {
		const self = makeVariableSelf({})
		self.initVariables()
		const ids = ['transition_type', 'mix_type', 'wipe_type', 'wipe_direction']
		for (const id of ids) {
			const def = self._registered.find((d) => d.variableId === id)
			assert.ok(def, `${id} not registered`)
		}
	})

	test('variable names are correct', () => {
		const self = makeVariableSelf({})
		self.initVariables()
		const expectations = [
			['transition_type', 'Transition Type'],
			['mix_type', 'Mix Type'],
			['wipe_type', 'Wipe Type'],
			['wipe_direction', 'Wipe Direction'],
		]
		for (const [id, name] of expectations) {
			const def = self._registered.find((d) => d.variableId === id)
			assert.equal(def.name, name)
		}
	})
})

// ── checkVariables — transition label lookup ──────────────────────────────────

describe('checkVariables — transition_type label lookup', () => {
	test('resolves 0 to Mix', () => {
		const self = makeVariableSelf({ transitiontype: 0 })
		self.checkVariables()
		assert.equal(self._result.captured.transition_type, 'Mix')
	})

	test('resolves 1 to Wipe', () => {
		const self = makeVariableSelf({ transitiontype: 1 })
		self.checkVariables()
		assert.equal(self._result.captured.transition_type, 'Wipe')
	})

	test('falls back to raw integer for unknown id', () => {
		const self = makeVariableSelf({ transitiontype: 99 })
		self.checkVariables()
		assert.equal(self._result.captured.transition_type, 99)
	})

	test('passes undefined when transitiontype is unset', () => {
		const self = makeVariableSelf({})
		self.checkVariables()
		assert.equal(self._result.captured.transition_type, undefined)
	})
})

describe('checkVariables — mix_type label lookup', () => {
	test('resolves 0 to Mix', () => {
		const self = makeVariableSelf({ mixtype: 0 })
		self.checkVariables()
		assert.equal(self._result.captured.mix_type, 'Mix')
	})

	test('resolves 1 to Fam', () => {
		const self = makeVariableSelf({ mixtype: 1 })
		self.checkVariables()
		assert.equal(self._result.captured.mix_type, 'Fam')
	})

	test('resolves 2 to Nam', () => {
		const self = makeVariableSelf({ mixtype: 2 })
		self.checkVariables()
		assert.equal(self._result.captured.mix_type, 'Nam')
	})

	test('falls back to raw integer for unknown id', () => {
		const self = makeVariableSelf({ mixtype: 99 })
		self.checkVariables()
		assert.equal(self._result.captured.mix_type, 99)
	})

	test('passes undefined when mixtype is unset', () => {
		const self = makeVariableSelf({})
		self.checkVariables()
		assert.equal(self._result.captured.mix_type, undefined)
	})
})

describe('checkVariables — wipe_type label lookup', () => {
	test('resolves 0 to Horizontal', () => {
		const self = makeVariableSelf({ wipetype: 0 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_type, 'Horizontal')
	})

	test('resolves 7 to V-Center', () => {
		const self = makeVariableSelf({ wipetype: 7 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_type, 'V-Center')
	})

	test('falls back to raw integer for unknown id', () => {
		const self = makeVariableSelf({ wipetype: 99 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_type, 99)
	})

	test('passes undefined when wipetype is unset', () => {
		const self = makeVariableSelf({})
		self.checkVariables()
		assert.equal(self._result.captured.wipe_type, undefined)
	})
})

describe('checkVariables — wipe_direction label lookup', () => {
	test('resolves 0 to Normal', () => {
		const self = makeVariableSelf({ wipedirection: 0 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_direction, 'Normal')
	})

	test('resolves 1 to Reverse', () => {
		const self = makeVariableSelf({ wipedirection: 1 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_direction, 'Reverse')
	})

	test('resolves 2 to Round Trip', () => {
		const self = makeVariableSelf({ wipedirection: 2 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_direction, 'Round Trip')
	})

	test('falls back to raw integer for unknown id', () => {
		const self = makeVariableSelf({ wipedirection: 99 })
		self.checkVariables()
		assert.equal(self._result.captured.wipe_direction, 99)
	})

	test('passes undefined when wipedirection is unset', () => {
		const self = makeVariableSelf({})
		self.checkVariables()
		assert.equal(self._result.captured.wipe_direction, undefined)
	})
})

describe('checkVariables — all four transition fields resolve independently', () => {
	test('each field resolves to its own label with mixed values', () => {
		const self = makeVariableSelf({
			transitiontype: 1,
			mixtype: 2,
			wipetype: 5,
			wipedirection: 2,
		})
		self.checkVariables()
		assert.equal(self._result.captured.transition_type, 'Wipe')
		assert.equal(self._result.captured.mix_type, 'Nam')
		assert.equal(self._result.captured.wipe_type, 'Lower Right')
		assert.equal(self._result.captured.wipe_direction, 'Round Trip')
	})
})
