'use strict'

// Freeze Type + Select-input feature tests — see CLAUDE-FREEZE-PLAN.md §2/§4
// (PR 2) for the design and CLAUDE-FREEZE-TYPE-SELECT-IMPLEMENT.md for this
// slice's exact scope: freezeSwitchType/freezeSwitchSelectEnableDisable
// wired to the SAME pending-overlay mechanism the accepted Freeze On/Off
// work (test/freezeOnOff.test.js) already implements and tests for the
// 'freeze' field, extended here to the 'freeze_type' field and the 16
// 'freeze_select_<XX>' fields (HDMI IN 1-8 -> 02-09, SDI IN 1-8 -> 0A-11).
//
// This file does NOT re-prove the generic pending-overlay timer mechanism
// (dual cancellation + record-identity defenses) from scratch — that is
// already covered field-agnostically by test/freezeOnOff.test.js's own
// "api.js — dual timer-defense safeguards" block, since _setFreezePending/
// _clearFreezePending/_clearAllFreezePending take `field` as a plain
// parameter and behave identically regardless of which field name is
// passed. What IS new and tested here: the two actions' own wiring to
// these new fields, the parser's new per-field acknowledgement branches,
// the two new feedbacks/17 new variables reading them, field independence
// under CONCURRENT pendings for different fields, the lifecycle refresh
// list actually including the new feedback ids, and the Select-enable
// upgrade migration.
//
// Describe blocks:
//   1. src/actions.js — freezeSwitchType / freezeSwitchSelectEnableDisable
//   2. src/feedbacks.js — freeze_type_select / freeze_input_selected
//   3. src/variables.js — the 17 new variables
//   4. src/api.js — pending-overlay field independence (new fields)
//   5. src/api.js — the REAL parser acknowledges the new fields
//   6. Full chain — real action -> pending -> real feedback/variable
//      publish -> real expiry, for both new actions
//   7. Full connection lifecycle — multiple Freeze fields pending across
//      connection replacement, reconnect, and destroy()
//   8. src/upgrades.js — freezeSwitchSelectEnableDisable's numeric-enable
//      migration (index 2)
//
// None of these use node:test's mock.timers — see
// test-support/capturedTimers.js (shared with test/freezeOnOff.test.js).

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { createEnvironment, authenticate, simulateReady } = require('../test-support/lifecycleHarness')
const { withCapturedTimers } = require('../test-support/capturedTimers')

// ── Module stubs (mirrors test/smallCorrectnessFixtures.test.js) ────────────

const BASE_STUB = {
	InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected', Error: 'error' },
	TCPHelper: class {},
	combineRgb: (r, g, b) => ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff),
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
const actions = require('../src/actions')
const feedbacks = require('../src/feedbacks')
const variables = require('../src/variables')
const constants = require('../src/constants')
const upgrades = require('../src/upgrades')
const { extractMessages } = require('../src/tcpParser')

// All 16 Freeze Select input addresses, matching src/constants.js's
// CHOICES_FREEZE_INPUTS and the V-160HD_Control_eng06_W.pdf p.24 FREEZE
// table: HDMI IN 1-8 at 02-09, SDI IN 1-8 at 0A-11.
const FREEZE_SELECT_ADDRESSES = constants.CHOICES_FREEZE_INPUTS.map((c) => c.id)
assert.equal(FREEZE_SELECT_ADDRESSES.length, 16, 'sanity: 16 Freeze Select inputs expected')

// ── 1. actions.js — freezeSwitchType / freezeSwitchSelectEnableDisable ─────

function makeTypeSelectActionsSelf(socket) {
	const sent = []
	const rawSent = []
	const pendingCalls = []
	const feedbackChecks = []
	let variableChecksCount = 0
	const self = Object.assign(Object.create(actions), Object.assign({}, constants), {
		DATA: {},
		config: {},
		socket,
		sendCommand: (addr, val) => sent.push({ addr, val }),
		sendRawCommand: (cmd) => rawSent.push(cmd),
		getFreezeData: () => rawSent.push('__getFreezeData__'),
		_setFreezePending: (field, value, onExpire) => pendingCalls.push({ field, value, onExpire }),
		checkFeedbacks: (...types) => feedbackChecks.push(types),
		checkVariables: () => variableChecksCount++,
		log: () => {},
	})
	let actionsDefs = null
	self.setActionDefinitions = (a) => {
		actionsDefs = a
	}
	self.initActions()
	return {
		self,
		sent,
		rawSent,
		pendingCalls,
		feedbackChecks,
		get variableChecksCount() {
			return variableChecksCount
		},
		get actions() {
			return actionsDefs
		},
	}
}

describe('actions — freezeSwitchType', () => {
	for (const type of ['00', '01']) {
		test(`connected: type=${type} sends absolute value, a same-address readback, requests the full Freeze block once, and sets the freeze_type pending`, () => {
			const result = makeTypeSelectActionsSelf({ isConnected: true })
			result.actions.freezeSwitchType.callback({ options: { type } }, {})

			assert.deepEqual(result.sent, [{ addr: '020501', val: type }])
			assert.deepEqual(result.rawSent, ['RQH:020501,000001;', '__getFreezeData__'])
			assert.equal(result.pendingCalls.length, 1)
			assert.equal(result.pendingCalls[0].field, 'freeze_type')
			assert.equal(result.pendingCalls[0].value, type)
			assert.ok(
				result.feedbackChecks.some((types) => types.includes('freeze_type_select')),
				'checkFeedbacks("freeze_type_select") called synchronously',
			)
			assert.ok(result.variableChecksCount >= 1, 'checkVariables called synchronously')
		})
	}

	test('connected: sends type=00 (All) even when a Select-mode pending already exists — absolute command, not computed from current state', () => {
		const result = makeTypeSelectActionsSelf({ isConnected: true })
		result.self.DATA.freeze_type = '01'
		result.actions.freezeSwitchType.callback({ options: { type: '00' } }, {})
		assert.equal(result.sent[0].val, '00')
	})

	test('disconnected: the write is still sent, but no pending, no readback, and no Freeze-block request', () => {
		const result = makeTypeSelectActionsSelf(undefined)
		result.actions.freezeSwitchType.callback({ options: { type: '01' } }, {})

		assert.deepEqual(result.sent, [{ addr: '020501', val: '01' }])
		assert.deepEqual(result.rawSent, [], 'no readback and no Freeze-block request while disconnected')
		assert.deepEqual(result.pendingCalls, [])
		assert.deepEqual(result.feedbackChecks, [])
		assert.equal(result.variableChecksCount, 0)
	})

	test('socket present but not connected: same disconnected fallback path', () => {
		const result = makeTypeSelectActionsSelf({ isConnected: false })
		result.actions.freezeSwitchType.callback({ options: { type: '00' } }, {})
		assert.deepEqual(result.sent, [{ addr: '020501', val: '00' }])
		assert.deepEqual(result.rawSent, [])
	})
})

describe('actions — freezeSwitchSelectEnableDisable', () => {
	for (const input of FREEZE_SELECT_ADDRESSES) {
		for (const enable of ['00', '01']) {
			test(`connected: input=${input} enable=${enable} sends the exact write address/value, a same-address readback (no Freeze-block request), and sets the correct per-input pending field`, () => {
				const result = makeTypeSelectActionsSelf({ isConnected: true })
				result.actions.freezeSwitchSelectEnableDisable.callback({ options: { input, enable } }, {})

				assert.deepEqual(result.sent, [{ addr: '0205' + input, val: enable }])
				assert.deepEqual(
					result.rawSent,
					['RQH:0205' + input + ',000001;'],
					'exactly the same-address readback — no Freeze-block request for Select (unlike Type)',
				)
				assert.equal(result.pendingCalls.length, 1)
				assert.equal(result.pendingCalls[0].field, 'freeze_select_' + input)
				assert.equal(result.pendingCalls[0].value, enable)
				assert.ok(
					result.feedbackChecks.some((types) => types.includes('freeze_input_selected')),
					'checkFeedbacks("freeze_input_selected") called synchronously',
				)
				assert.ok(result.variableChecksCount >= 1)
			})
		}
	}

	test('disconnected: the write is still sent, but no pending, no readback', () => {
		const result = makeTypeSelectActionsSelf(undefined)
		result.actions.freezeSwitchSelectEnableDisable.callback({ options: { input: '0A', enable: '01' } }, {})

		assert.deepEqual(result.sent, [{ addr: '02050A', val: '01' }])
		assert.deepEqual(result.rawSent, [])
		assert.deepEqual(result.pendingCalls, [])
	})

	test("the Enable/Disable option's default is the string '01', not the number 1 (the fixed bug)", () => {
		const result = makeTypeSelectActionsSelf({ isConnected: true })
		const opt = result.actions.freezeSwitchSelectEnableDisable.options.find((o) => o.id === 'enable')
		assert.equal(opt.default, '01')
		assert.equal(typeof opt.default, 'string')
	})

	test("the Input option's choices come from the shared CHOICES_FREEZE_INPUTS constant (16 entries, default '02')", () => {
		const result = makeTypeSelectActionsSelf({ isConnected: true })
		const opt = result.actions.freezeSwitchSelectEnableDisable.options.find((o) => o.id === 'input')
		assert.equal(opt.default, '02')
		assert.deepEqual(
			opt.choices.map((c) => c.id),
			FREEZE_SELECT_ADDRESSES,
		)
	})
})

// ── 2. feedbacks.js — freeze_type_select / freeze_input_selected ───────────

describe('feedbacks.freeze_type_select — reads the pending overlay via _freezeValue', () => {
	function makeFeedbacksSelf(freezeValueStub) {
		let defs = null
		const self = Object.assign(Object.create(feedbacks), Object.assign({}, constants), {
			DATA: {},
			_freezeValue: freezeValueStub,
			setFeedbackDefinitions: (f) => {
				defs = f
			},
		})
		self.initFeedbacks()
		return defs
	}

	test('true when _freezeValue("freeze_type") is "01"', () => {
		const defs = makeFeedbacksSelf((field) => (field === 'freeze_type' ? '01' : undefined))
		assert.equal(defs.freeze_type_select.callback({ options: {} }, {}), true)
	})

	test('false when _freezeValue("freeze_type") is "00"', () => {
		const defs = makeFeedbacksSelf((field) => (field === 'freeze_type' ? '00' : undefined))
		assert.equal(defs.freeze_type_select.callback({ options: {} }, {}), false)
	})

	test('has no options — it is a single global indicator, unlike freeze_input_selected', () => {
		const defs = makeFeedbacksSelf(() => '00')
		assert.deepEqual(defs.freeze_type_select.options, [])
	})
})

describe('feedbacks.freeze_input_selected — reads the pending overlay via _freezeValue, per chosen input', () => {
	function makeFeedbacksSelf(freezeValueStub) {
		let defs = null
		const self = Object.assign(Object.create(feedbacks), Object.assign({}, constants), {
			DATA: {},
			_freezeValue: freezeValueStub,
			setFeedbackDefinitions: (f) => {
				defs = f
			},
		})
		self.initFeedbacks()
		return defs
	}

	test("options: dropdown 'input', default '02', all 16 CHOICES_FREEZE_INPUTS choices", () => {
		const defs = makeFeedbacksSelf(() => '00')
		const opt = defs.freeze_input_selected.options.find((o) => o.id === 'input')
		assert.equal(opt.default, '02')
		assert.deepEqual(
			opt.choices.map((c) => c.id),
			FREEZE_SELECT_ADDRESSES,
		)
	})

	for (const input of ['02', '0A', '11']) {
		test(`input=${input}: true exactly when _freezeValue("freeze_select_${input}") is "01"`, () => {
			const calls = []
			const defs = makeFeedbacksSelf((field) => {
				calls.push(field)
				return field === `freeze_select_${input}` ? '01' : '00'
			})
			assert.equal(defs.freeze_input_selected.callback({ options: { input } }, {}), true)
			assert.ok(calls.includes(`freeze_select_${input}`), 'queried the exact per-input field, not a different one')
		})
	}

	test("changing a neighboring input option does not change this input's own result — no cross-input leakage", () => {
		// Only freeze_select_02 is "on"; every other input must read false.
		const defs = makeFeedbacksSelf((field) => (field === 'freeze_select_02' ? '01' : '00'))
		assert.equal(defs.freeze_input_selected.callback({ options: { input: '02' } }, {}), true)
		assert.equal(defs.freeze_input_selected.callback({ options: { input: '03' } }, {}), false)
		assert.equal(defs.freeze_input_selected.callback({ options: { input: '0A' } }, {}), false)
	})

	test('reads true even when Freeze is Off and Type is All — not conditioned on either', () => {
		const self = Object.assign(Object.create(feedbacks), Object.assign({}, constants), {
			DATA: { freeze: '00', freeze_type: '00', freeze_select_02: '01' },
			_freezeValue: function (field) {
				return this.DATA[field]
			},
			setFeedbackDefinitions: (f) => {
				defs = f
			},
		})
		let defs = null
		self.setFeedbackDefinitions = (f) => {
			defs = f
		}
		self.initFeedbacks()
		assert.equal(
			defs.freeze_input_selected.callback({ options: { input: '02' } }, {}),
			true,
			'Select-enable bit is independent of Freeze On/Off and Type All/Select',
		)
	})
})

// ── 3. variables.js — the 17 new Freeze Type/Select variables ──────────────

describe('variables — freeze_type and the 16 freeze_select_* variables', () => {
	function makeVariablesSelf(freezeValueStub) {
		const setValuesCalls = []
		const self = Object.assign(Object.create(variables), Object.assign({}, constants), {
			TALLYDATA: [],
			DATA: {},
			CHOICES_OUTPUTSASSIGN: [],
			CHOICES_PGMPVW_SELECT: [],
			_freezeValue: freezeValueStub,
			log: () => {},
			setVariableValues: (obj) => setValuesCalls.push(obj),
		})
		self.checkVariables()
		return setValuesCalls
	}

	test('exactly 17 new variableIds are registered (freeze_type + 8 hdmi + 8 sdi), each exactly once', () => {
		const registered = []
		const self = Object.assign(Object.create(variables), Object.assign({}, constants), {
			TALLYDATA: [],
			setVariableDefinitions: (vars) => registered.push(...vars),
		})
		self.initVariables()

		const expectedIds = ['freeze_type']
		for (let i = 1; i <= 8; i++) {
			expectedIds.push('freeze_select_hdmi' + i)
			expectedIds.push('freeze_select_sdi' + i)
		}
		assert.equal(expectedIds.length, 17)
		for (const id of expectedIds) {
			const matches = registered.filter((v) => v.variableId === id)
			assert.equal(matches.length, 1, `variableId "${id}" must be registered exactly once, found ${matches.length}`)
		}
	})

	test('freeze_type is "Select" when _freezeValue("freeze_type") is "01", "All" otherwise', () => {
		let calls = makeVariablesSelf((field) => (field === 'freeze_type' ? '01' : undefined))
		assert.equal(calls.at(-1).freeze_type, 'Select')
		calls = makeVariablesSelf((field) => (field === 'freeze_type' ? '00' : undefined))
		assert.equal(calls.at(-1).freeze_type, 'All')
	})

	test('freeze_select_hdmi1..8 map to DATA addresses 02..09, freeze_select_sdi1..8 map to 0A..11', () => {
		const queried = []
		const calls = makeVariablesSelf((field) => {
			queried.push(field)
			return field === 'freeze_select_02' || field === 'freeze_select_11' ? '01' : '00'
		})
		const last = calls.at(-1)
		assert.equal(last.freeze_select_hdmi1, 'Enabled', 'hdmi1 -> address 02')
		assert.equal(last.freeze_select_sdi8, 'Enabled', 'sdi8 -> address 11')
		assert.equal(last.freeze_select_hdmi2, 'Disabled')
		assert.equal(last.freeze_select_sdi1, 'Disabled')
		assert.ok(queried.includes('freeze_select_02') && queried.includes('freeze_select_11'))
	})

	test('a neighboring input variable does not change when only one input is Enabled — no cross-input leakage', () => {
		const calls = makeVariablesSelf((field) => (field === 'freeze_select_05' ? '01' : '00'))
		const last = calls.at(-1)
		assert.equal(last.freeze_select_hdmi4, 'Enabled', 'address 05 -> hdmi4')
		for (const id of ['freeze_select_hdmi1', 'freeze_select_hdmi2', 'freeze_select_hdmi3', 'freeze_select_sdi1']) {
			assert.equal(last[id], 'Disabled', `${id} must be unaffected`)
		}
	})

	test('unknown initial state (DATA/_freezeValue return undefined) falls back to "All"/"Disabled", not a crash or a false-positive "Select"/"Enabled"', () => {
		const calls = makeVariablesSelf(() => undefined)
		const last = calls.at(-1)
		assert.equal(last.freeze_type, 'All')
		assert.equal(last.freeze_select_hdmi1, 'Disabled')
		assert.equal(last.freeze_select_sdi8, 'Disabled')
	})

	test('reflects a pending overlay that disagrees with DATA — proves it reads _freezeValue, not DATA directly', () => {
		const self = Object.assign(Object.create(variables), Object.assign({}, constants), {
			TALLYDATA: [],
			DATA: { freeze_type: '00', freeze_select_02: '00' },
			CHOICES_OUTPUTSASSIGN: [],
			CHOICES_PGMPVW_SELECT: [],
			_freezeValue: function (field) {
				if (field === 'freeze_type') return '01'
				if (field === 'freeze_select_02') return '01'
				return this.DATA[field]
			},
			log: () => {},
		})
		const calls = []
		self.setVariableValues = (obj) => calls.push(obj)
		self.checkVariables()
		assert.equal(calls.at(-1).freeze_type, 'Select')
		assert.equal(calls.at(-1).freeze_select_hdmi1, 'Enabled')
	})
})

// ── 4. api.js — pending-overlay field independence (new fields) ────────────

function makeApiSelf() {
	return Object.assign(Object.create(api), {
		config: { verbose: false },
		log: () => {},
	})
}

describe('api.js — Freeze pending fields are independent of each other', () => {
	test('concurrent pending for freeze, freeze_type, and one Select field: each has its own record/timer and its own value, unaffected by the others', () => {
		withCapturedTimers(() => {
			const self = makeApiSelf()
			self.DATA = { freeze: '00', freeze_type: '00', freeze_select_02: '00' }
			self._setFreezePending('freeze', '01', () => {})
			self._setFreezePending('freeze_type', '01', () => {})
			self._setFreezePending('freeze_select_02', '01', () => {})

			assert.equal(self._freezeValue('freeze'), '01')
			assert.equal(self._freezeValue('freeze_type'), '01')
			assert.equal(self._freezeValue('freeze_select_02'), '01')
			assert.equal(
				self._freezeValue('freeze_select_03'),
				undefined,
				'an untouched field has no pending and no DATA yet',
			)

			self._clearFreezePending('freeze_type')
			assert.equal(self._freezeValue('freeze_type'), '00', 'clearing one field falls it back to DATA')
			assert.equal(self._freezeValue('freeze'), '01', 'the other two fields are untouched by clearing freeze_type')
			assert.equal(self._freezeValue('freeze_select_02'), '01')
		})
	})

	test('_clearAllFreezePending clears every field at once, regardless of how many are pending', () => {
		withCapturedTimers((timers) => {
			const self = makeApiSelf()
			self.DATA = {}
			const ids = ['freeze', 'freeze_type', 'freeze_select_02', 'freeze_select_11']
			const timerIds = ids.map((field) => {
				self._setFreezePending(field, '01', () => {})
				return self._freezePending[field].timer
			})

			self._clearAllFreezePending()

			for (const id of timerIds) assert.ok(timers.wasCleared(id))
			assert.deepEqual(self._freezePending, {})
		})
	})

	test('defense #2 (record-identity check) generalizes to a non-"freeze" field: freeze_type, same-value supersession with cancellation bypassed', () => {
		// The generic mechanism was already proven field-agnostic in
		// test/freezeOnOff.test.js's dual-defense block for 'freeze' itself
		// — this is a single representative check that it actually holds
		// for a DIFFERENT field too, not a full re-proof of the mechanism.
		withCapturedTimers((timers) => {
			const self = makeApiSelf()
			self.DATA = { freeze_type: 'FALLBACK' }
			const expireCalls = []
			self._setFreezePending('freeze_type', '01', () => expireCalls.push('first'))
			const firstId = self._freezePending.freeze_type.timer

			timers.bypassNextClear()
			self._setFreezePending('freeze_type', '01', () => expireCalls.push('second'))

			timers.invoke(firstId)
			assert.deepEqual(expireCalls, [], 'the stale callback for freeze_type is rejected by the identity check')
			assert.equal(self._freezeValue('freeze_type'), '01')
		})
	})
})

// ── 5. api.js — the REAL parser acknowledges the new fields ────────────────

describe('src/api.js — real parser path acknowledges freeze_type and freeze_select_* fields', () => {
	function makeFreezePipelineSelf() {
		return Object.assign(Object.create(api), {
			config: { verbose: false },
			DATA: {},
			tcpBuffer: '',
			log: () => {},
			logVerbose: () => {},
			checkFeedbacks: () => {},
			checkVariables: () => {},
			setVariableValues: () => {},
		})
	}

	function feedRawDeviceData(self, rawBuffer) {
		const { messages, remaining } = extractMessages(rawBuffer)
		assert.equal(remaining, '', 'test fixture must send only complete messages')
		for (const msg of messages) self.updateData(msg)
	}

	test('single Type response DTH:020501,01; sets DATA.freeze_type and clears only the freeze_type pending', () => {
		withCapturedTimers(() => {
			const self = makeFreezePipelineSelf()
			self._setFreezePending('freeze_type', '00', () => {}) // pending disagrees with the incoming value
			self._setFreezePending('freeze_select_02', '01', () => {}) // unrelated field, must survive
			feedRawDeviceData(self, 'DTH:020501,01;')
			assert.equal(self.DATA.freeze_type, '01')
			assert.equal(
				self._freezePending.freeze_type,
				undefined,
				'freeze_type pending cleared despite the disagreeing value',
			)
			assert.equal(self._freezePending.freeze_select_02.value, '01', 'the unrelated Select pending is untouched')
		})
	})

	for (const addr of FREEZE_SELECT_ADDRESSES) {
		test(`single Select response DTH:0205${addr},01; sets DATA.freeze_select_${addr} and clears only that field's pending`, () => {
			withCapturedTimers(() => {
				const self = makeFreezePipelineSelf()
				self._setFreezePending(`freeze_select_${addr}`, '00', () => {})
				self._setFreezePending('freeze_type', '01', () => {}) // unrelated field, must survive
				feedRawDeviceData(self, `DTH:0205${addr},01;`)
				assert.equal(self.DATA[`freeze_select_${addr}`], '01')
				assert.equal(self._freezePending[`freeze_select_${addr}`], undefined)
				assert.equal(self._freezePending.freeze_type.value, '01', 'the unrelated Type pending is untouched')
			})
		})
	}

	test('the 18-byte block response acknowledges all 18 fields at once (freeze, freeze_type, all 16 Select fields)', () => {
		withCapturedTimers(() => {
			const self = makeFreezePipelineSelf()
			self._setFreezePending('freeze', '00', () => {})
			self._setFreezePending('freeze_type', '00', () => {})
			for (const addr of FREEZE_SELECT_ADDRESSES) self._setFreezePending(`freeze_select_${addr}`, '00', () => {})

			// freeze=01, freeze_type=01, then 16 Select bytes all '01'.
			const block = '01' + '01' + '01'.repeat(16)
			feedRawDeviceData(self, `DTH:020500,${block};`)

			assert.equal(self.DATA.freeze, '01')
			assert.equal(self.DATA.freeze_type, '01')
			assert.equal(self._freezePending.freeze, undefined)
			assert.equal(self._freezePending.freeze_type, undefined)
			for (const addr of FREEZE_SELECT_ADDRESSES) {
				assert.equal(self.DATA[`freeze_select_${addr}`], '01', `DATA.freeze_select_${addr} set from the block`)
				assert.equal(self._freezePending[`freeze_select_${addr}`], undefined, `freeze_select_${addr} pending cleared`)
			}
		})
	})

	test('a malformed (non-hex) Type response does NOT clear the freeze_type pending or change DATA', () => {
		withCapturedTimers(() => {
			const self = makeFreezePipelineSelf()
			self._setFreezePending('freeze_type', '01', () => {})
			feedRawDeviceData(self, 'DTH:020501,ZZ;')
			assert.equal(self._freezePending.freeze_type.value, '01')
			assert.equal(self.DATA.freeze_type, undefined)
		})
	})

	test("a malformed (non-hex) Select response does NOT clear that field's pending or change DATA", () => {
		withCapturedTimers(() => {
			const self = makeFreezePipelineSelf()
			self._setFreezePending('freeze_select_0A', '01', () => {})
			feedRawDeviceData(self, 'DTH:02050A,ZZ;')
			assert.equal(self._freezePending.freeze_select_0A.value, '01')
			assert.equal(self.DATA.freeze_select_0A, undefined)
		})
	})

	test('a wrong-length block response (17 bytes, not 18) at 020500 does not fall through to the single-byte branch and does not acknowledge freeze_type/Select pendings', () => {
		withCapturedTimers(() => {
			const self = makeFreezePipelineSelf()
			self._setFreezePending('freeze_type', '01', () => {})
			self._setFreezePending('freeze_select_02', '01', () => {})
			const badBlock = '00'.repeat(17) // 17 bytes: neither a valid 18-byte block nor a valid 1-byte value
			feedRawDeviceData(self, `DTH:020500,${badBlock};`)
			assert.equal(self._freezePending.freeze_type.value, '01', 'unaffected by the malformed 020500 response')
			assert.equal(self._freezePending.freeze_select_02.value, '01')
			assert.equal(self.DATA.freeze_type, undefined)
		})
	})
})

// ── 6. Full chain — real action -> pending -> real feedback/variable -> ────
// ── real expiry, for freezeSwitchType and freezeSwitchSelectEnableDisable ──

function makeFreezeChainSelf(connected) {
	const sent = []
	const rawSent = []
	const feedbackCallCount = {} // { [feedbackId]: number of times checkFeedbacks named it }
	const variablePublishes = []

	let feedbackDefs = null
	let actionDefs = null

	const self = Object.assign({}, actions, feedbacks, variables, api, constants, {
		DATA: {},
		_freezePending: {},
		config: { verbose: false },
		socket: connected ? { isConnected: true } : undefined,
		sendCommand: (addr, val) => sent.push({ addr, val }),
		sendRawCommand: (cmd) => rawSent.push(cmd),
		log: () => {},
		logVerbose: () => {},
		setFeedbackDefinitions: (f) => {
			feedbackDefs = f
		},
		setVariableDefinitions: () => {},
		setActionDefinitions: (a) => {
			actionDefs = a
		},
		setVariableValues: (obj) => variablePublishes.push(obj),
		checkFeedbacks: function (...types) {
			for (const type of types) feedbackCallCount[type] = (feedbackCallCount[type] || 0) + 1
		},
	})
	self.initFeedbacks()
	self.initVariables()
	self.initActions()

	return {
		self,
		actionDefs,
		sent,
		rawSent,
		feedbackCallCount,
		variablePublishes,
		// Evaluates a feedback's REAL, registered callback right now — used
		// immediately after triggering an action or an expiry callback, i.e.
		// at the same moment production code itself called checkFeedbacks,
		// so this observes the value actually published at that update, not
		// a value read once at the end of the test.
		evalFeedback: (id, options) => feedbackDefs[id].callback({ options: options || {} }, {}),
	}
}

describe('full chain — freezeSwitchType: real action -> real pending -> real feedback/variable', () => {
	test('DATA stays unchanged before any response, but the real freeze_type_select feedback and the real published freeze_type variable already show Select', () => {
		const chain = makeFreezeChainSelf(true)
		chain.self.DATA.freeze_type = '00'

		withCapturedTimers(() => {
			chain.actionDefs.freezeSwitchType.callback({ options: { type: '01' } }, {})
		})

		assert.equal(chain.self.DATA.freeze_type, '00', 'DATA is written only by the parser, never by the action')
		assert.ok(
			chain.feedbackCallCount.freeze_type_select >= 1,
			'checkFeedbacks("freeze_type_select") was actually called',
		)
		assert.equal(chain.evalFeedback('freeze_type_select'), true, 'the real feedback already reports Select')
		assert.ok(chain.variablePublishes.length >= 1)
		assert.equal(
			chain.variablePublishes.at(-1).freeze_type,
			'Select',
			'the real published variable already reads Select',
		)
	})

	test('expiry (the real onExpire from actions.js) republishes the real feedback/variable back to DATA', () => {
		withCapturedTimers((timers) => {
			const chain = makeFreezeChainSelf(true)
			chain.self.DATA.freeze_type = '00'

			chain.actionDefs.freezeSwitchType.callback({ options: { type: '01' } }, {})
			const id = chain.self._freezePending.freeze_type.timer
			assert.equal(chain.evalFeedback('freeze_type_select'), true, 'Select shown before expiry')
			const countBefore = chain.feedbackCallCount.freeze_type_select

			timers.invoke(id)

			assert.ok(
				chain.feedbackCallCount.freeze_type_select > countBefore,
				'expiry triggers a further checkFeedbacks call',
			)
			assert.equal(chain.evalFeedback('freeze_type_select'), false, 'back to All (DATA) after expiry')
			assert.equal(chain.variablePublishes.at(-1).freeze_type, 'All')
		})
	})

	test('disconnected: the write is still sent, but the pending overlay and feedback/variable refresh are skipped', () => {
		const chain = makeFreezeChainSelf(false)
		chain.self.DATA.freeze_type = '00'
		chain.actionDefs.freezeSwitchType.callback({ options: { type: '01' } }, {})

		assert.deepEqual(chain.sent, [{ addr: '020501', val: '01' }])
		assert.equal(chain.self._freezePending.freeze_type, undefined)
		assert.deepEqual(chain.feedbackCallCount, {})
		assert.deepEqual(chain.variablePublishes, [])
	})
})

describe('full chain — freezeSwitchSelectEnableDisable: real action -> real pending -> real feedback/variable', () => {
	test('DATA stays unchanged before any response, but the real freeze_input_selected feedback (for that exact input) and the real published per-input variable already show Enabled', () => {
		const chain = makeFreezeChainSelf(true)
		chain.self.DATA.freeze_select_0A = '00'

		withCapturedTimers(() => {
			chain.actionDefs.freezeSwitchSelectEnableDisable.callback({ options: { input: '0A', enable: '01' } }, {})
		})

		assert.equal(chain.self.DATA.freeze_select_0A, '00')
		assert.ok(chain.feedbackCallCount.freeze_input_selected >= 1)
		assert.equal(chain.evalFeedback('freeze_input_selected', { input: '0A' }), true, 'the exact input reports Enabled')
		assert.equal(
			chain.evalFeedback('freeze_input_selected', { input: '0B' }),
			false,
			'a neighboring input is unaffected',
		)
		assert.equal(chain.variablePublishes.at(-1).freeze_select_sdi1, 'Enabled', 'address 0A -> sdi1')
		assert.equal(chain.variablePublishes.at(-1).freeze_select_sdi2, 'Disabled', 'address 0B -> sdi2, unaffected')
	})

	test('expiry (the real onExpire) republishes the real feedback/variable back to DATA, for the exact input written', () => {
		withCapturedTimers((timers) => {
			const chain = makeFreezeChainSelf(true)
			chain.self.DATA.freeze_select_02 = '00'

			chain.actionDefs.freezeSwitchSelectEnableDisable.callback({ options: { input: '02', enable: '01' } }, {})
			const id = chain.self._freezePending.freeze_select_02.timer
			assert.equal(chain.evalFeedback('freeze_input_selected', { input: '02' }), true)

			timers.invoke(id)

			assert.equal(
				chain.evalFeedback('freeze_input_selected', { input: '02' }),
				false,
				'back to Disabled (DATA) after expiry',
			)
			assert.equal(chain.variablePublishes.at(-1).freeze_select_hdmi1, 'Disabled')
		})
	})

	test('disconnected: the write is still sent, but the pending overlay and feedback/variable refresh are skipped', () => {
		const chain = makeFreezeChainSelf(false)
		chain.actionDefs.freezeSwitchSelectEnableDisable.callback({ options: { input: '11', enable: '01' } }, {})

		assert.deepEqual(chain.sent, [{ addr: '020511', val: '01' }])
		assert.equal(chain.self._freezePending.freeze_select_11, undefined)
		assert.deepEqual(chain.feedbackCallCount, {})
	})

	test('the real single-byte parser response for one input clears only that field, leaving a concurrently pending different input untouched', () => {
		const chain = makeFreezeChainSelf(true)
		chain.self.DATA.freeze_select_02 = '00'
		chain.self.DATA.freeze_select_03 = '00'

		withCapturedTimers(() => {
			chain.actionDefs.freezeSwitchSelectEnableDisable.callback({ options: { input: '02', enable: '01' } }, {})
			chain.actionDefs.freezeSwitchSelectEnableDisable.callback({ options: { input: '03', enable: '01' } }, {})
		})

		const { messages } = extractMessages('DTH:020502,01;')
		for (const msg of messages) chain.self.updateData(msg)

		assert.equal(chain.self.DATA.freeze_select_02, '01', 'the real parser wrote DATA for input 02')
		assert.equal(chain.self._freezePending.freeze_select_02, undefined, 'input 02 pending cleared')
		assert.notEqual(
			chain.self._freezePending.freeze_select_03,
			undefined,
			"input 03 pending is untouched by input 02's response",
		)
	})
})

// ── 7. Connection lifecycle — multiple Freeze fields pending ───────────────

describe('connection lifecycle — multiple Freeze fields pending across replacement/reconnect/destroy', () => {
	test("initConnection() replacement (host emptied, no new 'connect') clears freeze, freeze_type, AND a Select field all at once, and refreshes exactly the three Freeze feedback ids", () => {
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		const feedbackCalls = []
		const variableCalls = []
		env.self.checkFeedbacks = (...types) => feedbackCalls.push(types)
		env.self.checkVariables = () => variableCalls.push(true)

		env.self._setFreezePending('freeze', '01', () => {})
		env.self._setFreezePending('freeze_type', '01', () => {})
		env.self._setFreezePending('freeze_select_02', '01', () => {})

		env.self.config.host = ''
		env.self.initConnection()

		// _freezePending is a plain object created inside api.js's own vm
		// realm (see lifecycleHarness.js) — its Object.prototype is not the
		// same object as this test file's, so assert.deepEqual (strict, and
		// therefore prototype-sensitive) would wrongly fail even when both
		// are genuinely empty. Object.keys().length sidesteps that.
		assert.equal(
			Object.keys(env.self._freezePending).length,
			0,
			'every pending field is cleared, not just "freeze": ' + JSON.stringify(env.self._freezePending),
		)
		const namedTypes = feedbackCalls.flat()
		// The stub above simply records whatever types initConnection()
		// actually passed — it does not itself decide what "changed".
		// Respecting that filter is what lets this assertion catch a
		// regression that forgets to add the two new feedback ids back to
		// the lifecycle refresh call, per FREEZE-TYPE-SELECT-IMPLEMENT.md
		// §5 point 4.
		assert.ok(namedTypes.includes('freeze'), 'freeze feedback refresh requested')
		assert.ok(namedTypes.includes('freeze_type_select'), 'freeze_type_select feedback refresh requested')
		assert.ok(namedTypes.includes('freeze_input_selected'), 'freeze_input_selected feedback refresh requested')
		assert.ok(variableCalls.length > 0)
	})

	test("a fresh 'connect' (reconnect via the same or a replacement TCPHelper) clears all three fields and refreshes the same three feedback ids", () => {
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		const feedbackCalls = []
		env.self.checkFeedbacks = (...types) => feedbackCalls.push(types)
		env.self.checkVariables = () => {}

		env.self._setFreezePending('freeze', '01', () => {})
		env.self._setFreezePending('freeze_type', '01', () => {})
		env.self._setFreezePending('freeze_select_11', '01', () => {})

		env.self.initConnection()
		env.advance()
		simulateReady(env.helpers[env.helpers.length - 1])

		assert.equal(Object.keys(env.self._freezePending).length, 0)
		const namedTypes = feedbackCalls.flat()
		assert.ok(namedTypes.includes('freeze_type_select'))
		assert.ok(namedTypes.includes('freeze_input_selected'))
	})

	test('destroy() with freeze, freeze_type, and two Select fields pending: every timer is cancelled, no consumer update happens after destroy()', async () => {
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		const expired = []
		env.self._setFreezePending('freeze', '01', () => expired.push('freeze'))
		env.self._setFreezePending('freeze_type', '01', () => expired.push('freeze_type'))
		env.self._setFreezePending('freeze_select_02', '01', () => expired.push('freeze_select_02'))
		env.self._setFreezePending('freeze_select_0A', '01', () => expired.push('freeze_select_0A'))

		const feedbackCalls = []
		const variableCalls = []
		env.self.checkFeedbacks = (...types) => feedbackCalls.push(types)
		env.self.checkVariables = () => variableCalls.push(true)

		await env.self.destroy()
		env.advance(5000) // well past FREEZE_PENDING_TIMEOUT_MS (2000ms) for all four

		assert.deepEqual(expired, [], 'none of the four pending timers fire — all cancelled by destroy()')
		assert.deepEqual(feedbackCalls, [], 'destroy() itself triggers no feedback refresh')
		assert.deepEqual(variableCalls, [], 'destroy() itself triggers no variable refresh')
	})

	test('a rejected send for a new Freeze write (Select) does not escape as an unhandledRejection, and the pending value set alongside it still expires normally', async () => {
		// Mirrors connectionLifecycle.test.js's own rejected-send scenario
		// (a destroyed underlying socket, so isConnected stays true — see
		// that file's harness comment for why), but through a Select
		// address/value pair and with a pending value set at the same time
		// an action would set one, proving the two are independent: a
		// failed send does not prevent or corrupt the pending overlay, and
		// the pending overlay does not depend on the send having succeeded.
		const env = createEnvironment()
		const rejections = []
		const onUnhandled = (err) => rejections.push(err)
		process.on('unhandledRejection', onUnhandled)
		try {
			env.self.initConnection()
			env.advance()
			authenticate(env)
			env.advance(50)

			const helper = env.self.socket
			helper._socket.destroyed = true
			assert.equal(helper.isConnected, true, 'isConnected is unaffected — matches the real TCPHelper')

			env.self._setFreezePending('freeze_select_0A', '01', () => {})
			env.self.sendCommand('02050A', '01')
			env.self.sendRawCommand('RQH:02050A,000001;')
			env.advance(50)
			await new Promise((resolve) => setImmediate(resolve))

			assert.deepEqual(rejections, [], 'no unhandledRejection escapes from the rejected send')
			assert.equal(
				env.self._freezeValue('freeze_select_0A'),
				'01',
				'the pending value is unaffected by the failed send',
			)
			assert.equal(
				env.statuses.at(-1).status,
				'connection_failure',
				'the failed send is still observable as a status change',
			)
		} finally {
			process.removeListener('unhandledRejection', onUnhandled)
		}
	})
})

// ── 8. src/upgrades.js — freezeSwitchSelectEnableDisable numeric-enable ────
// ── migration (index 2) ─────────────────────────────────────────────────

describe('upgrades.js — index 2: freezeSwitchSelectEnableDisable numeric enable migration', () => {
	const MIGRATION = upgrades[2]

	function makeAction(actionId, options, overrides) {
		return Object.assign(
			{
				id: 'act-' + Math.random().toString(36).slice(2),
				controlId: 'ctrl-1',
				actionId,
				options: Object.assign({}, options),
			},
			overrides,
		)
	}

	function runMigration(actions) {
		return MIGRATION({ currentConfig: null }, { config: null, actions, feedbacks: [] })
	}

	test('exactly three upgrade scripts are registered, in order, and index 2 is a function', () => {
		assert.equal(upgrades.length, 3)
		assert.equal(typeof upgrades[2], 'function')
	})

	test('numeric enable:1 is migrated to the string "01"', () => {
		const act = makeAction('freezeSwitchSelectEnableDisable', { input: '02', enable: 1 })
		const result = runMigration([act])
		assert.equal(result.updatedActions.length, 1)
		assert.equal(result.updatedActions[0], act)
		assert.equal(act.options.enable, '01')
		assert.equal(act.options.input, '02', 'the input option is untouched')
	})

	test('numeric enable:0 is migrated to the string "00"', () => {
		const act = makeAction('freezeSwitchSelectEnableDisable', { input: '0A', enable: 0 })
		const result = runMigration([act])
		assert.equal(result.updatedActions.length, 1)
		assert.equal(act.options.enable, '00')
	})

	test('an already-correct string enable value is left untouched and not reported as updated', () => {
		const act = makeAction('freezeSwitchSelectEnableDisable', { input: '02', enable: '01' })
		const result = runMigration([act])
		assert.equal(result.updatedActions.length, 0)
		assert.equal(act.options.enable, '01')
	})

	test('a different, unrelated action is never touched', () => {
		const act = makeAction('freezeSwitchType', { type: '01' })
		const result = runMigration([act])
		assert.equal(result.updatedActions.length, 0)
		assert.deepEqual(act.options, { type: '01' })
	})

	test('other options, other actions, and config are untouched; only options.enable itself changes on the matching action', () => {
		const target = makeAction('freezeSwitchSelectEnableDisable', { input: '0F', enable: 1, someOtherOption: 'kept' })
		const other = makeAction('cameraPanLeft', { camera: '41' })
		const result = runMigration([target, other])
		assert.equal(result.updatedActions.length, 1)
		assert.equal(result.updatedActions[0], target)
		assert.equal(target.options.input, '0F')
		assert.equal(target.options.someOtherOption, 'kept')
		assert.deepEqual(other.options, { camera: '41' })
		assert.equal(result.updatedConfig, null)
	})

	test('running the migration a second time makes no further changes (idempotent)', () => {
		const act = makeAction('freezeSwitchSelectEnableDisable', { input: '02', enable: 1 })
		runMigration([act])
		assert.equal(act.options.enable, '01')
		const second = runMigration([act])
		assert.equal(second.updatedActions.length, 0, 'no further change once already migrated')
	})

	test('the prior index-1 AUX/PnP feedback migration still works unaffected by adding index 2', () => {
		const AUX_MIGRATION = upgrades[1]
		const fb = {
			id: 'fb-1',
			controlId: 'ctrl-1',
			feedbackId: 'auxTally',
			options: { aux: '11', assign: '01' },
		}
		const result = AUX_MIGRATION({ currentConfig: null }, { config: null, actions: [], feedbacks: [fb] })
		assert.equal(result.updatedFeedbacks.length, 1)
		assert.equal(fb.options.aux, 'aux1')
	})

	test("the migrated action's callback sends the correct two-digit protocol value (not the raw number 1)", () => {
		const act = makeAction('freezeSwitchSelectEnableDisable', { input: '09', enable: 1 })
		runMigration([act])
		assert.equal(act.options.enable, '01')

		const sent = []
		const self = Object.assign(Object.create(actions), Object.assign({}, constants), {
			DATA: {},
			config: {},
			socket: undefined, // disconnected path: exercises the plain sendCommand call directly
			sendCommand: (addr, val) => sent.push({ addr, val }),
			sendRawCommand: () => {},
			log: () => {},
		})
		let defs = null
		self.setActionDefinitions = (a) => {
			defs = a
		}
		self.initActions()
		defs.freezeSwitchSelectEnableDisable.callback({ options: act.options }, {})

		assert.deepEqual(sent, [{ addr: '020509', val: '01' }], 'sends the migrated string value, not the number 1')
	})
})
