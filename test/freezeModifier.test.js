'use strict'

// Set Freeze modifier + combined pvwOrFreezeToggle action tests — see
// CLAUDE-FREEZE-PLAN.md §2/§4 (PR 3) for the design and
// CLAUDE-FREEZE-MODIFIER-IMPLEMENT.md for this slice's exact scope: a
// purely local `freeze_select_mode` UI flag (freezeSelectModeEnable/
// Disable, the freeze_select_mode_active feedback, the freeze_select_mode
// variable), plus pvwOrFreezeToggle, which either writes the existing PVW
// select address (modifier off) or toggles one Freeze Select input's
// enable bit through the SAME pending-overlay mechanism the accepted
// Freeze Type/Select work already implements and tests (modifier on).
//
// This file does NOT re-prove the generic pending-overlay timer mechanism
// (dual cancellation + record-identity defenses) or the Freeze Select
// field-independence/parser-acknowledgement paths from scratch — both are
// already proven field-agnostically in test/freezeOnOff.test.js and
// test/freezeTypeSelect.test.js, and the toggle branch below reuses
// exactly the same _setFreezePending/_clearFreezePending mechanism and
// the same 'freeze_select_<XX>' fields those files already cover for the
// absolute freezeSwitchSelectEnableDisable action. What IS new and tested
// here: the modifier flag's own lifecycle and consumers, the toggle's own
// value computation (via _freezeValue, never raw DATA) and its two
// independent options, the PVW branch's write/debounce-preserving
// behavior, and that both branches never affect the other's state.
//
// Learned from FREEZE-TYPE-SELECT-INDEPENDENT-REVIEW.md and
// FREEZE-TYPE-SELECT-FOLLOWUP-REVIEW.md (applied from the start here,
// not fixed after the fact):
//   - the full-chain harness's checkFeedbacks stub records each named
//     feedback's real callback result AT THE MOMENT it is called (a bare
//     call with no ids refreshes every registered feedback, matching real
//     Companion/parser semantics), never evaluated later in a separate
//     statement;
//   - a reconnect-isolation test sets its pending value(s) immediately
//     before the reconnect's own 'connect' event, never earlier — a value
//     set before a 30000ms virtual-clock advance would already have
//     expired via its own unrelated 2000ms deadline, proving nothing
//     about the 'connect' handler specifically.
//
// Describe blocks:
//   1. Modifier state — freezeSelectModeEnable/Disable, freeze_select_mode_active, freeze_select_mode variable
//   2. pvwOrFreezeToggle — PVW branch (modifier off)
//   3. pvwOrFreezeToggle — Freeze toggle branch (modifier on)
//   4. Rapid/mixed writes and cross-option wiring
//   5. Full chain — real action -> pending/flag -> real feedback/variable -> real expiry
//   6. Connection lifecycle — modifier persistence, Freeze pending cleanup stays separate
//   7. Mutation verification (development round only, not part of the branch)

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { createEnvironment, authenticate, simulateReady, simulateError } = require('../test-support/lifecycleHarness')
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
const presets = require('../src/presets')
const constants = require('../src/constants')
const { extractMessages } = require('../src/tcpParser')

const FREEZE_SELECT_ADDRESSES = constants.CHOICES_FREEZE_INPUTS.map((c) => c.id)
const PVW_PHYSICAL_SOURCES = constants.CHOICES_PVW_PHYSICAL_SOURCES.map((c) => c.id)
assert.equal(FREEZE_SELECT_ADDRESSES.length, 16, 'sanity: 16 Freeze Select inputs expected')
assert.equal(PVW_PHYSICAL_SOURCES.length, 16, 'sanity: 16 PVW physical sources expected')

// ── Shared actions-level harness (direct require, house pattern) ───────────

function makeModifierActionsSelf(socket, modifierOn) {
	const sent = []
	const rawSent = []
	const pendingCalls = []
	const feedbackChecks = []
	let variableChecksCount = 0
	const self = Object.assign(Object.create(actions), Object.assign({}, constants), {
		DATA: {},
		config: {},
		socket,
		freeze_select_mode: modifierOn === true,
		sendCommand: (addr, val) => sent.push({ addr, val }),
		sendRawCommand: (cmd) => rawSent.push(cmd),
		getAuxSources: () => rawSent.push('__getAuxSources__'),
		_setFreezePending: (field, value, onExpire) => pendingCalls.push({ field, value, onExpire }),
		_freezeValue: (field) => self.DATA[field],
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

// ── 1. Modifier state ────────────────────────────────────────────────────

describe('Set Freeze modifier — index.js constructor initial state', () => {
	test('a fresh instance starts with freeze_select_mode === false', () => {
		const Module = require('module')
		const FAKE_KEY = '__test_companion_base_modifier__'
		let capturedClass = null

		require.cache[FAKE_KEY] = {
			id: FAKE_KEY,
			filename: FAKE_KEY,
			loaded: true,
			exports: {
				InstanceBase: class InstanceBase {
					constructor() {}
				},
				InstanceStatus: BASE_STUB.InstanceStatus,
				TCPHelper: class {},
				combineRgb: () => 0,
				Regex: { IP: null },
				runEntrypoint: (cls) => {
					capturedClass = cls
				},
			},
		}

		const origResolve = Module._resolveFilename.bind(Module)
		Module._resolveFilename = function (request, ...rest) {
			if (request === '@companion-module/base') return FAKE_KEY
			return origResolve(request, ...rest)
		}

		const indexPath = require.resolve('../index.js')
		delete require.cache[indexPath]
		try {
			require('../index.js')
		} finally {
			Module._resolveFilename = origResolve
			delete require.cache[FAKE_KEY]
			delete require.cache[indexPath]
		}

		assert.ok(capturedClass !== null, 'runEntrypoint must be called with the module class')
		const instance = new capturedClass({})
		assert.equal(instance.freeze_select_mode, false, 'freeze_select_mode must initialize to false')
	})
})

describe('actions — freezeSelectModeEnable / freezeSelectModeDisable', () => {
	test('Enable sets the flag true and refreshes the feedback + real checkVariables computation, no commands sent', () => {
		const result = makeModifierActionsSelf(undefined, false)
		result.actions.freezeSelectModeEnable.callback({ options: {} }, {})

		assert.equal(result.self.freeze_select_mode, true)
		assert.ok(result.feedbackChecks.some((t) => t.includes('freeze_select_mode_active')))
		assert.equal(result.variableChecksCount, 1)
		assert.deepEqual(result.sent, [])
		assert.deepEqual(result.rawSent, [])
	})

	test('Disable sets the flag false and refreshes the feedback + real checkVariables computation, no commands sent', () => {
		const result = makeModifierActionsSelf(undefined, true)
		result.actions.freezeSelectModeDisable.callback({ options: {} }, {})

		assert.equal(result.self.freeze_select_mode, false)
		assert.ok(result.feedbackChecks.some((t) => t.includes('freeze_select_mode_active')))
		assert.equal(result.variableChecksCount, 1)
		assert.deepEqual(result.sent, [])
	})

	test('Enable and Disable both work identically with NO socket at all (undefined) — never gated on connection state', () => {
		const enableResult = makeModifierActionsSelf(undefined, false)
		enableResult.actions.freezeSelectModeEnable.callback({ options: {} }, {})
		assert.equal(enableResult.self.freeze_select_mode, true)

		const disableResult = makeModifierActionsSelf(undefined, true)
		disableResult.actions.freezeSelectModeDisable.callback({ options: {} }, {})
		assert.equal(disableResult.self.freeze_select_mode, false)
	})

	test('Enable and Disable both work identically with a DISCONNECTED socket (isConnected: false)', () => {
		const enableResult = makeModifierActionsSelf({ isConnected: false }, false)
		enableResult.actions.freezeSelectModeEnable.callback({ options: {} }, {})
		assert.equal(enableResult.self.freeze_select_mode, true)

		const disableResult = makeModifierActionsSelf({ isConnected: false }, true)
		disableResult.actions.freezeSelectModeDisable.callback({ options: {} }, {})
		assert.equal(disableResult.self.freeze_select_mode, false)
	})

	test('repeated Enable/Enable/Disable/Disable is safe and each call still refreshes consumers', () => {
		const result = makeModifierActionsSelf(undefined, false)
		result.actions.freezeSelectModeEnable.callback({ options: {} }, {})
		result.actions.freezeSelectModeEnable.callback({ options: {} }, {})
		assert.equal(result.self.freeze_select_mode, true)
		result.actions.freezeSelectModeDisable.callback({ options: {} }, {})
		result.actions.freezeSelectModeDisable.callback({ options: {} }, {})
		assert.equal(result.self.freeze_select_mode, false)
		assert.equal(result.variableChecksCount, 4, 'checkVariables runs on every call, not deduplicated')
	})

	test('both actions have no options', () => {
		const result = makeModifierActionsSelf(undefined, false)
		assert.deepEqual(result.actions.freezeSelectModeEnable.options, [])
		assert.deepEqual(result.actions.freezeSelectModeDisable.options, [])
	})
})

describe('feedbacks.freeze_select_mode_active — reads the local flag directly, not via _freezeValue', () => {
	function makeFeedbacksSelf(flag) {
		let defs = null
		const self = Object.assign(Object.create(feedbacks), Object.assign({}, constants), {
			DATA: {},
			freeze_select_mode: flag,
			_freezeValue: () => {
				throw new Error('freeze_select_mode_active must not call _freezeValue — it is not a DATA field')
			},
			setFeedbackDefinitions: (f) => {
				defs = f
			},
		})
		self.initFeedbacks()
		return defs
	}

	test('true when freeze_select_mode is true', () => {
		const defs = makeFeedbacksSelf(true)
		assert.equal(defs.freeze_select_mode_active.callback({ options: {} }, {}), true)
	})

	test('false when freeze_select_mode is false', () => {
		const defs = makeFeedbacksSelf(false)
		assert.equal(defs.freeze_select_mode_active.callback({ options: {} }, {}), false)
	})

	test('has no options', () => {
		const defs = makeFeedbacksSelf(false)
		assert.deepEqual(defs.freeze_select_mode_active.options, [])
	})
})

describe('variables — freeze_select_mode registration and computation', () => {
	test('registered exactly once, with the reference-matching name', () => {
		const registered = []
		const self = Object.assign(Object.create(variables), Object.assign({}, constants), {
			TALLYDATA: [],
			setVariableDefinitions: (vars) => registered.push(...vars),
		})
		self.initVariables()
		const matches = registered.filter((v) => v.variableId === 'freeze_select_mode')
		assert.equal(matches.length, 1)
		assert.equal(matches[0].name, 'Freeze Select Mode Active')
	})

	test('"Active" when freeze_select_mode is true, "Off" when false — read directly, not via _freezeValue', () => {
		function makeSelf(flag) {
			const calls = []
			const self = Object.assign(Object.create(variables), Object.assign({}, constants), {
				TALLYDATA: [],
				DATA: {},
				CHOICES_OUTPUTSASSIGN: [],
				CHOICES_PGMPVW_SELECT: [],
				freeze_select_mode: flag,
				// Only freeze_select_mode itself must never be computed via
				// _freezeValue — every OTHER variable checkVariables()
				// computes (freeze, freeze_type, the 16 select fields) still
				// legitimately calls this, so only that one field throws;
				// everything else gets a harmless fallback.
				_freezeValue: (field) => {
					if (field === 'freeze_select_mode') {
						throw new Error('freeze_select_mode must not be computed via _freezeValue')
					}
					return undefined
				},
				log: () => {},
				setVariableValues: (obj) => calls.push(obj),
			})
			self.checkVariables()
			return calls
		}
		assert.equal(makeSelf(true).at(-1).freeze_select_mode, 'Active')
		assert.equal(makeSelf(false).at(-1).freeze_select_mode, 'Off')
	})
})

// ── 2. pvwOrFreezeToggle — PVW branch (modifier off) ────────────────────────

describe('actions — pvwOrFreezeToggle, modifier OFF: PVW select branch', () => {
	for (const input of PVW_PHYSICAL_SOURCES) {
		test(`input=${input}: writes 002101 with exactly that value and calls getAuxSources() exactly once — no Freeze changes at all`, () => {
			const result = makeModifierActionsSelf({ isConnected: true }, false)
			result.actions.pvwOrFreezeToggle.callback({ options: { input, freeze_addr: '02' } }, {})

			assert.deepEqual(result.sent, [{ addr: '002101', val: input }])
			assert.deepEqual(result.rawSent, ['__getAuxSources__'])
			assert.deepEqual(result.pendingCalls, [], 'the Freeze branch must not run at all')
			assert.deepEqual(
				result.feedbackChecks,
				[],
				'no Freeze feedback refresh — getAuxSources() owns its own refresh path',
			)
		})
	}

	test('the real getAuxSources() debounce is preserved: two rapid PVW-branch calls within 250ms issue the RQH queries only once', () => {
		// Uses the REAL api.js getAuxSources (not the harness's stub above)
		// wired onto a real actions.js self, to prove the existing
		// debounce still governs this action's own refresh call — this
		// action must not bypass or duplicate it.
		const sent = []
		const rawSent = []
		const self = Object.assign(Object.create(actions), Object.assign({}, api), Object.assign({}, constants), {
			DATA: {},
			config: { verbose: false },
			socket: { isConnected: true },
			sendCommand: (addr, val) => sent.push({ addr, val }),
			sendRawCommand: (cmd) => rawSent.push(cmd),
			_queue: { enqueue: (cmd) => rawSent.push(cmd) },
			log: () => {},
		})
		let defs = null
		self.setActionDefinitions = (a) => {
			defs = a
		}
		self.initActions()

		defs.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '02' } }, {})
		const rawSentAfterFirst = rawSent.length
		defs.pvwOrFreezeToggle.callback({ options: { input: '01', freeze_addr: '02' } }, {})

		assert.equal(
			sent.length,
			2,
			'both presses still send their own PST Select write — the debounce only affects the read refresh',
		)
		assert.equal(
			rawSent.length,
			rawSentAfterFirst,
			'the second press, within 250ms, must not enqueue a second set of RQH queries',
		)
	})
})

// ── 3. pvwOrFreezeToggle — Freeze toggle branch (modifier on) ───────────────

describe('actions — pvwOrFreezeToggle, modifier ON: Freeze Select toggle branch', () => {
	for (const addr of FREEZE_SELECT_ADDRESSES) {
		test(`freeze_addr=${addr}: current '00' toggles to '01' — correct write/readback/pending`, () => {
			const result = makeModifierActionsSelf({ isConnected: true }, true)
			result.self.DATA[`freeze_select_${addr}`] = '00'
			result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: addr } }, {})

			assert.deepEqual(result.sent, [{ addr: '0205' + addr, val: '01' }])
			assert.deepEqual(result.rawSent, ['RQH:0205' + addr + ',000001;'])
			assert.equal(result.pendingCalls.length, 1)
			assert.equal(result.pendingCalls[0].field, 'freeze_select_' + addr)
			assert.equal(result.pendingCalls[0].value, '01')
			assert.ok(result.feedbackChecks.some((t) => t.includes('freeze_input_selected')))
		})

		test(`freeze_addr=${addr}: current '01' toggles to '00'`, () => {
			const result = makeModifierActionsSelf({ isConnected: true }, true)
			result.self.DATA[`freeze_select_${addr}`] = '01'
			result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: addr } }, {})

			assert.equal(result.sent[0].val, '00')
			assert.equal(result.pendingCalls[0].value, '00')
		})
	}

	test('unknown initial state (DATA[field] undefined): the first press sends "01", matching the reference', () => {
		const result = makeModifierActionsSelf({ isConnected: true }, true)
		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '05' } }, {})
		assert.equal(result.sent[0].val, '01')
	})

	test('toggle reads the value via _freezeValue, not raw DATA — a pending overlay that disagrees with DATA governs the computed toggle', () => {
		const result = makeModifierActionsSelf({ isConnected: true }, true)
		result.self.DATA.freeze_select_02 = '00' // stale/disagreeing DATA
		result.self._freezeValue = (field) => (field === 'freeze_select_02' ? '01' : result.self.DATA[field])
		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '02' } }, {})
		assert.equal(result.sent[0].val, '00', 'toggled from the pending "01", not from stale DATA "00"')
	})

	test('disconnected: the computed write is still sent, but no pending, no readback', () => {
		const result = makeModifierActionsSelf(undefined, true)
		result.self.DATA.freeze_select_0A = '01'
		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '0A' } }, {})

		assert.deepEqual(result.sent, [{ addr: '02050A', val: '00' }])
		assert.deepEqual(result.rawSent, [])
		assert.deepEqual(result.pendingCalls, [])
	})

	test('socket present but not connected: same disconnected fallback path', () => {
		const result = makeModifierActionsSelf({ isConnected: false }, true)
		result.self.DATA.freeze_select_11 = '00'
		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '11' } }, {})

		assert.deepEqual(result.sent, [{ addr: '020511', val: '01' }])
		assert.deepEqual(result.rawSent, [])
	})

	test('modifier ON never touches PVW: no 002101 write, no getAuxSources() call', () => {
		const result = makeModifierActionsSelf({ isConnected: true }, true)
		result.self.DATA.freeze_select_02 = '00'
		result.actions.pvwOrFreezeToggle.callback({ options: { input: '05', freeze_addr: '02' } }, {})

		assert.ok(!result.sent.some((s) => s.addr === '002101'), 'no PVW select write')
		assert.ok(!result.rawSent.includes('__getAuxSources__'), 'no getAuxSources() call')
	})
})

// ── 4. Rapid/mixed writes and cross-option wiring ───────────────────────────

describe('pvwOrFreezeToggle — cross-option wiring and rapid/mixed writes', () => {
	test('input and freeze_addr are independent options: a deliberately mismatched pair uses input ONLY for PVW and freeze_addr ONLY for Freeze', () => {
		// modifier off: only `input` matters, `freeze_addr` must be ignored
		const pvwResult = makeModifierActionsSelf({ isConnected: true }, false)
		pvwResult.actions.pvwOrFreezeToggle.callback({ options: { input: '07', freeze_addr: '11' } }, {})
		assert.equal(pvwResult.sent[0].addr, '002101')
		assert.equal(pvwResult.sent[0].val, '07', 'uses input, not freeze_addr, for the PVW write')

		// modifier on: only `freeze_addr` matters, `input` must be ignored
		const freezeResult = makeModifierActionsSelf({ isConnected: true }, true)
		freezeResult.self.DATA.freeze_select_11 = '00'
		freezeResult.actions.pvwOrFreezeToggle.callback({ options: { input: '07', freeze_addr: '11' } }, {})
		assert.equal(freezeResult.sent[0].addr, '020511', 'uses freeze_addr, not input, for the Freeze write')
		assert.equal(freezeResult.sent[0].val, '01')
	})

	test('two immediate toggle presses starting from DATA "00", with no response in between, produce the literal sequence "01", "00"', () => {
		const result = makeModifierActionsSelf({ isConnected: true }, true)
		result.self.DATA.freeze_select_02 = '00'
		// _freezeValue must reflect the pending set by the first press for
		// the second press to compute correctly — the shared, real
		// _setFreezePending/_freezeValue pair (not this harness's
		// pendingCalls-recording stub) is what makes this work in
		// production; simulate that coupling here directly.
		let pendingValue
		result.self._setFreezePending = (field, value) => {
			pendingValue = value
		}
		result.self._freezeValue = (field) => (pendingValue !== undefined ? pendingValue : result.self.DATA[field])

		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '02' } }, {})
		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '02' } }, {})

		assert.deepEqual(
			result.sent.map((s) => s.val),
			['01', '00'],
		)
	})

	test('the absolute freezeSwitchSelectEnableDisable action and the new toggle action share the same effective state: an absolute Enable followed by a toggle press flips it back to Disable', () => {
		const result = makeModifierActionsSelf({ isConnected: true }, true)
		result.self.DATA.freeze_select_02 = '00'
		let pendingValue
		result.self._setFreezePending = (field, value) => {
			pendingValue = value
		}
		result.self._freezeValue = (field) => (pendingValue !== undefined ? pendingValue : result.self.DATA[field])

		result.actions.freezeSwitchSelectEnableDisable.callback({ options: { input: '02', enable: '01' } }, {})
		assert.equal(pendingValue, '01')

		result.actions.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '02' } }, {})
		assert.equal(result.sent.at(-1).val, '00', "the toggle reads the absolute action's own pending value and flips it")
	})
})

// ── 5. Full chain — real action -> pending/flag -> real feedback/variable ──
// ── -> real expiry ───────────────────────────────────────────────────────

function makeFreezeModifierChainSelf(connected) {
	const sent = []
	const rawSent = []
	const feedbackHistory = [] // [{ type, options, value }], appended INSIDE checkFeedbacks, in call order
	const variablePublishes = []
	const watchedOptions = {}

	let feedbackDefs = null
	let actionDefs = null

	const self = Object.assign({}, actions, feedbacks, variables, api, constants, {
		DATA: {},
		_freezePending: {},
		freeze_select_mode: false,
		config: { verbose: false },
		socket: connected ? { isConnected: true } : undefined,
		sendCommand: (addr, val) => sent.push({ addr, val }),
		sendRawCommand: (cmd) => rawSent.push(cmd),
		// getAuxSources is NOT stubbed here — the real api.js one (spread in
		// via ...api above) runs, calling this same stubbed sendRawCommand,
		// so its real RQH queries (and its real 250ms debounce) are directly
		// observable in `rawSent`.
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
			const effectiveTypes = types.length ? types : Object.keys(feedbackDefs)
			for (const type of effectiveTypes) {
				const def = feedbackDefs[type]
				if (!def) continue
				const options = watchedOptions[type] || {}
				feedbackHistory.push({ type, options, value: def.callback({ options }, {}) })
			}
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
		feedbackHistory,
		variablePublishes,
		watchFeedbackOptions: (type, options) => {
			watchedOptions[type] = options
		},
		lastFeedbackValue: (type) => {
			for (let i = feedbackHistory.length - 1; i >= 0; i--) {
				if (feedbackHistory[i].type === type) return feedbackHistory[i].value
			}
			return undefined
		},
	}
}

describe('full chain — freezeSelectModeEnable/Disable: real feedback + real registered variable', () => {
	test('Enable: the real checkFeedbacks call already published true, and the real published variable already shows Active', () => {
		const chain = makeFreezeModifierChainSelf(true)
		chain.actionDefs.freezeSelectModeEnable.callback({ options: {} }, {})

		assert.equal(chain.lastFeedbackValue('freeze_select_mode_active'), true)
		assert.equal(chain.variablePublishes.at(-1).freeze_select_mode, 'Active')
	})

	test('Disable: the real checkFeedbacks call already published false, and the real published variable already shows Off', () => {
		const chain = makeFreezeModifierChainSelf(true)
		chain.self.freeze_select_mode = true
		chain.actionDefs.freezeSelectModeDisable.callback({ options: {} }, {})

		assert.equal(chain.lastFeedbackValue('freeze_select_mode_active'), false)
		assert.equal(chain.variablePublishes.at(-1).freeze_select_mode, 'Off')
	})
})

describe('full chain — pvwOrFreezeToggle: real action -> real pending -> real feedback/variable -> real expiry', () => {
	test('modifier ON: DATA stays unchanged before any response, but the real checkFeedbacks call already published the toggled value, for the exact input', () => {
		const chain = makeFreezeModifierChainSelf(true)
		chain.self.freeze_select_mode = true
		chain.self.DATA.freeze_select_0A = '00'
		chain.watchFeedbackOptions('freeze_input_selected', { input: '0A' })

		withCapturedTimers(() => {
			chain.actionDefs.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '0A' } }, {})
		})

		assert.equal(chain.self.DATA.freeze_select_0A, '00', 'DATA is written only by the parser, never by the action')
		assert.equal(
			chain.lastFeedbackValue('freeze_input_selected'),
			true,
			'toggled 00 -> 01, recorded at the real checkFeedbacks call',
		)
		assert.equal(chain.variablePublishes.at(-1).freeze_select_sdi1, 'Enabled', 'address 0A -> sdi1')
	})

	test('modifier ON: expiry (the real onExpire) republishes the real feedback/variable back to DATA', () => {
		withCapturedTimers((timers) => {
			const chain = makeFreezeModifierChainSelf(true)
			chain.self.freeze_select_mode = true
			chain.self.DATA.freeze_select_02 = '00'
			chain.watchFeedbackOptions('freeze_input_selected', { input: '02' })

			chain.actionDefs.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '02' } }, {})
			const id = chain.self._freezePending.freeze_select_02.timer
			assert.equal(chain.lastFeedbackValue('freeze_input_selected'), true, 'Enabled recorded before expiry')
			const historyLenBefore = chain.feedbackHistory.length

			timers.invoke(id)

			assert.ok(chain.feedbackHistory.length > historyLenBefore, 'expiry triggers a further, real checkFeedbacks call')
			assert.equal(
				chain.lastFeedbackValue('freeze_input_selected'),
				false,
				'back to Disabled (DATA), recorded at that real call',
			)
			assert.equal(chain.variablePublishes.at(-1).freeze_select_hdmi1, 'Disabled')
		})
	})

	test('modifier ON: the real single-byte parser response clears the pending overlay and the real feedback/variable end up backed by real DATA', () => {
		const chain = makeFreezeModifierChainSelf(true)
		chain.self.freeze_select_mode = true
		chain.self.DATA.freeze_select_05 = '00'
		chain.watchFeedbackOptions('freeze_input_selected', { input: '05' })

		withCapturedTimers(() => {
			chain.actionDefs.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '05' } }, {})
		})
		assert.equal(chain.lastFeedbackValue('freeze_input_selected'), true)

		const { messages } = extractMessages('DTH:020505,01;')
		for (const msg of messages) chain.self.updateData(msg)

		assert.equal(chain.self.DATA.freeze_select_05, '01', 'the real parser wrote DATA')
		assert.equal(chain.self._freezePending.freeze_select_05, undefined, 'pending cleared by the real parser')
	})

	test('modifier OFF: real getAuxSources() runs (PGM/PVW/Aux queries enqueued), and no Freeze feedback/variable is touched', () => {
		const chain = makeFreezeModifierChainSelf(true)
		chain.self.freeze_select_mode = false

		chain.actionDefs.pvwOrFreezeToggle.callback({ options: { input: '03', freeze_addr: '02' } }, {})

		assert.deepEqual(chain.sent, [{ addr: '002101', val: '03' }])
		assert.ok(
			chain.rawSent.some((c) => typeof c === 'string' && c.startsWith('RQH:002100,000002;')),
			'the real getAuxSources() enqueued its PGM/PVW query',
		)
		assert.deepEqual(chain.feedbackHistory, [], 'no Freeze feedback is checked on the PVW branch')
	})

	test('disconnected: the write is still sent, but the pending overlay and feedback/variable refresh are skipped', () => {
		const chain = makeFreezeModifierChainSelf(false)
		chain.self.freeze_select_mode = true
		chain.self.DATA.freeze_select_11 = '01'
		chain.actionDefs.pvwOrFreezeToggle.callback({ options: { input: '00', freeze_addr: '11' } }, {})

		assert.deepEqual(chain.sent, [{ addr: '020511', val: '00' }])
		assert.equal(chain.self._freezePending.freeze_select_11, undefined)
		assert.deepEqual(chain.feedbackHistory, [])
	})
})

// ── 6. Connection lifecycle — modifier persistence, Freeze cleanup separate ─

describe('connection lifecycle — the Set Freeze modifier is untouched by connection events; Freeze pending cleanup stays separate', () => {
	test('a TCP error + same-helper reconnect (no initConnection() call) does not reset the modifier flag', () => {
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		env.self.freeze_select_mode = true

		simulateError(env.helpers[0], 'ECONNRESET')
		env.advance(30000)
		simulateReady(env.helpers[0])

		assert.equal(env.self.freeze_select_mode, true, 'the modifier survives a same-helper reconnect')
	})

	test('an initConnection() replacement (config update / new connection attempt on the same instance) does not reset the modifier flag, even though it clears Freeze pending', () => {
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		env.self.freeze_select_mode = true
		env.self._setFreezePending('freeze_select_02', '01', () => {})

		env.self.initConnection()
		env.advance()
		simulateReady(env.helpers[env.helpers.length - 1])

		assert.equal(
			env.self.freeze_select_mode,
			true,
			'the modifier survives initConnection() being called again on this instance',
		)
		assert.equal(
			Object.keys(env.self._freezePending).length,
			0,
			'Freeze pending is still cleared as before — the two lifecycles are independent, not coupled',
		)
	})

	test('a REAL configUpdated() call — real initActions/initFeedbacks/initVariables/initPresets, network-isolated — does not reset the modifier flag: the registered feedback returns true and the published freeze_select_mode is Active', () => {
		// lifecycleHarness's own createEnvironment() deliberately does not
		// load actions/feedbacks/variables/presets/constants (irrelevant to
		// most lifecycle tests — see the harness's own comment), so
		// env.self.configUpdated() would otherwise throw calling
		// this.initActions() etc. Merge in the REAL modules (this file's
		// own top-level requires — the same production code the other
		// describe blocks already exercise) so the real configUpdated()
		// can actually run end to end. initConnection() at the end of
		// configUpdated() still runs through the SAME fake-socket/virtual-
		// clock TCPHelper machinery createEnvironment() already set up —
		// no real network connection is ever opened, here or anywhere else
		// in this test.
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		env.self.freeze_select_mode = true
		Object.assign(env.self, actions, feedbacks, variables, presets, constants)

		let feedbackDefs = null
		const variablePublishes = []
		env.self.setActionDefinitions = () => {}
		env.self.setFeedbackDefinitions = (f) => {
			feedbackDefs = f
		}
		env.self.setVariableDefinitions = () => {}
		env.self.setPresetDefinitions = () => {}
		env.self.setVariableValues = (obj) => variablePublishes.push(obj)
		// checkFeedbacks itself is a Companion-SDK method (not part of any
		// src/ module) — the harness's own no-op stub is fine for this
		// test's purposes: the registered feedback's own callback is
		// evaluated directly below, against the REAL feedbackDefs that
		// initFeedbacks() just registered.
		env.self.checkFeedbacks = () => {}

		env.self.configUpdated(env.self.config)
		env.advance()

		assert.equal(env.self.freeze_select_mode, true, 'the modifier survives a real configUpdated() call')
		assert.ok(
			feedbackDefs && feedbackDefs.freeze_select_mode_active,
			'the real initFeedbacks() actually registered freeze_select_mode_active',
		)
		assert.equal(
			feedbackDefs.freeze_select_mode_active.callback({ options: {} }, {}),
			true,
			"the registered feedback's own real callback returns true",
		)
		assert.ok(variablePublishes.length > 0, "the real checkVariables() (called inside configUpdated()) published something")
		assert.equal(
			variablePublishes.at(-1).freeze_select_mode,
			'Active',
			'the real published freeze_select_mode variable is Active',
		)
	})

	test('destroy() does not reset or otherwise touch the modifier flag', async () => {
		const env = createEnvironment()
		env.self.initConnection()
		env.advance()
		authenticate(env)
		env.advance(50)

		env.self.freeze_select_mode = true
		await env.self.destroy()

		assert.equal(
			env.self.freeze_select_mode,
			true,
			'destroy() must not reset the modifier — only a brand-new instance does',
		)
	})

	test('a genuinely new instance (not this same one) starts at false regardless of what a previous instance had — simulated by a fresh createEnvironment()', () => {
		const firstEnv = createEnvironment()
		firstEnv.self.freeze_select_mode = true
		assert.equal(firstEnv.self.freeze_select_mode, true)

		const secondEnv = createEnvironment()
		assert.equal(secondEnv.self.freeze_select_mode, false, 'a new instance is unaffected by the first one')
	})

	test('a rejected send for a toggle write does not escape as an unhandledRejection, and the pending value set alongside it still expires normally at its own 2000ms deadline', async () => {
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

			env.self.DATA.freeze_select_02 = 'FALLBACK'
			env.self._setFreezePending('freeze_select_02', '01', () => {})
			env.self.sendCommand('020502', '01')
			env.self.sendRawCommand('RQH:020502,000001;')
			env.advance(50)
			await new Promise((resolve) => setImmediate(resolve))

			assert.deepEqual(rejections, [])
			assert.equal(env.self._freezeValue('freeze_select_02'), '01', 'unaffected by the failed send, 50ms in')

			env.advance(1950)
			assert.equal(env.self._freezeValue('freeze_select_02'), 'FALLBACK', 'still expires normally at its own deadline')
		} finally {
			process.removeListener('unhandledRejection', onUnhandled)
		}
	})
})
