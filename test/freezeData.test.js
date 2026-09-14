'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const api = require('../src/api')

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSelf(dataInit) {
	return Object.assign(Object.create(api), {
		config: { verbose: false },
		DATA: Object.assign({}, dataInit),
		MODEL: '',
		VERSION: '',
		TALLYDATA: [],
		CHOICES_PNPKEY_SOURCES: [],
		log: () => {},
		logVerbose: () => {},
		socket: undefined,
		updateStatus: () => {},
		startInterval: () => {},
		subscribeToTally: () => {},
		sendRawCommand: () => {},
		checkFeedbacks: () => {},
		checkVariables: () => {},
		setVariableValues: () => {},
		updateTally: () => {},
	})
}

function feed(self, dthLine) {
	self.updateData(dthLine)
}

// Build a 36-char hex string for a freeze block.
// bytes[i] is the hex pair for position i (i=0: freeze SW, i=1: freeze type, i=2-17: select 02-11)
function makeBlock(bytes) {
	return bytes.map((b) => b.padStart(2, '0')).join('')
}

// ── getFreezeData — polling command ──────────────────────────────────────────

describe('getFreezeData — sends correct RQH command', () => {
	test('sends RQH:020500,000012 as 18-byte block read', () => {
		const sent = []
		const self = Object.assign(Object.create(api), {
			config: {},
			socket: { isConnected: true, send: (cmd) => sent.push(cmd) },
			log: () => {},
		})
		self.getFreezeData()
		assert.ok(
			sent.some((c) => c.includes('RQH:020500,000012')),
			'RQH:020500,000012 not sent',
		)
	})
})

// ── DTH handler — 18-byte block response (address 020500) ────────────────────

describe('DTH handler — 18-byte block sets all freeze DATA', () => {
	test('freeze SW is byte[0]', () => {
		const bytes = Array(18).fill('00')
		bytes[0] = '01'
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze, '01')
	})

	test('freeze_type is byte[1]', () => {
		const bytes = Array(18).fill('00')
		bytes[1] = '01'
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze_type, '01')
	})

	test('freeze_select_02 is byte[2] (HDMI IN 1)', () => {
		const bytes = Array(18).fill('00')
		bytes[2] = '01'
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze_select_02, '01')
	})

	test('freeze_select_11 is byte[17] (SDI IN 8)', () => {
		const bytes = Array(18).fill('00')
		bytes[17] = '01'
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze_select_11, '01')
	})

	test('freeze_select_0A is byte[10] (SDI IN 1) — uppercase key', () => {
		const bytes = Array(18).fill('00')
		bytes[10] = '01'
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze_select_0A, '01')
	})

	test('all-zero block', () => {
		const bytes = Array(18).fill('00')
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze, '00')
		assert.equal(self.DATA.freeze_type, '00')
		assert.equal(self.DATA.freeze_select_02, '00')
		assert.equal(self.DATA.freeze_select_11, '00')
	})

	test('all-ones block', () => {
		const bytes = Array(18).fill('01')
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.freeze, '01')
		assert.equal(self.DATA.freeze_type, '01')
		assert.equal(self.DATA.freeze_select_03, '01') // HDMI IN 2
		assert.equal(self.DATA.freeze_select_09, '01') // HDMI IN 8
		assert.equal(self.DATA.freeze_select_0A, '01') // SDI IN 1
		assert.equal(self.DATA.freeze_select_0F, '01') // SDI IN 6
		assert.equal(self.DATA.freeze_select_10, '01') // SDI IN 7
		assert.equal(self.DATA.freeze_select_11, '01') // SDI IN 8
	})

	test('all 16 select keys present: 02 through 11', () => {
		const bytes = Array(18).fill('00')
		for (let i = 2; i <= 17; i++) bytes[i] = '01'
		const self = makeSelf({})
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		const expected = ['02', '03', '04', '05', '06', '07', '08', '09', '0A', '0B', '0C', '0D', '0E', '0F', '10', '11']
		for (const key of expected) {
			assert.equal(self.DATA[`freeze_select_${key}`], '01', `missing freeze_select_${key}`)
		}
	})

	test('block does not affect unrelated DATA', () => {
		const self = makeSelf({ aux1source: '05', monitor1assign: '04' })
		const bytes = Array(18).fill('01')
		feed(self, `DTH:020500,${makeBlock(bytes)};`)
		assert.equal(self.DATA.aux1source, '05') // unchanged
		assert.equal(self.DATA.monitor1assign, '04') // unchanged
	})
})

// ── DTH handler — single-byte fallback at 020500 (freeze state) ──────────────

describe('DTH handler — single-byte freeze state notification (020500)', () => {
	test('updates freeze only', () => {
		const self = makeSelf({ freeze_type: '01', freeze_select_02: '01' })
		feed(self, 'DTH:020500,01;')
		assert.equal(self.DATA.freeze, '01')
		assert.equal(self.DATA.freeze_type, '01') // unchanged
		assert.equal(self.DATA.freeze_select_02, '01') // unchanged
	})

	test('freeze off', () => {
		const self = makeSelf({ freeze: '01' })
		feed(self, 'DTH:020500,00;')
		assert.equal(self.DATA.freeze, '00')
	})
})

// ── DTH handler — freeze type notification (020501) ──────────────────────────

describe('DTH handler — freeze type notification (020501)', () => {
	test('updates freeze_type only', () => {
		const self = makeSelf({ freeze: '01', freeze_select_02: '00' })
		feed(self, 'DTH:020501,01;')
		assert.equal(self.DATA.freeze_type, '01') // SELECT
		assert.equal(self.DATA.freeze, '01') // unchanged
		assert.equal(self.DATA.freeze_select_02, '00') // unchanged
	})

	test('ALL type', () => {
		const self = makeSelf({ freeze_type: '01' })
		feed(self, 'DTH:020501,00;')
		assert.equal(self.DATA.freeze_type, '00')
	})
})

// ── DTH handler — per-input select notifications (020502–020511) ──────────────

describe('DTH handler — HDMI IN 1 select (020502)', () => {
	test('updates freeze_select_02 only', () => {
		const self = makeSelf({ freeze: '01', freeze_select_03: '00' })
		feed(self, 'DTH:020502,01;')
		assert.equal(self.DATA.freeze_select_02, '01')
		assert.equal(self.DATA.freeze, '01') // unchanged
		assert.equal(self.DATA.freeze_select_03, '00') // unchanged
	})
})

describe('DTH handler — HDMI IN 8 select (020509)', () => {
	test('updates freeze_select_09', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020509,01;')
		assert.equal(self.DATA.freeze_select_09, '01')
	})
})

describe('DTH handler — SDI IN 1 select (02050A) — uppercase key', () => {
	test('updates freeze_select_0A', () => {
		const self = makeSelf({})
		feed(self, 'DTH:02050A,01;')
		assert.equal(self.DATA.freeze_select_0A, '01')
	})
})

describe('DTH handler — SDI IN 8 select (020511)', () => {
	test('updates freeze_select_11', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020511,01;')
		assert.equal(self.DATA.freeze_select_11, '01')
	})
})

// ── DTH handler — malformed values rejected ───────────────────────────────────

describe('DTH handler — malformed block rejected at 020500', () => {
	test('17-byte (34 hex chars) does not set any freeze DATA', () => {
		const self = makeSelf({ freeze: 'FF', freeze_type: 'FF', freeze_select_02: 'FF' })
		feed(self, `DTH:020500,${'00'.repeat(17)};`)
		assert.equal(self.DATA.freeze, 'FF')
		assert.equal(self.DATA.freeze_type, 'FF')
		assert.equal(self.DATA.freeze_select_02, 'FF')
	})

	test('19-byte (38 hex chars) does not set any freeze DATA', () => {
		const self = makeSelf({ freeze: 'FF', freeze_type: 'FF', freeze_select_02: 'FF' })
		feed(self, `DTH:020500,${'00'.repeat(19)};`)
		assert.equal(self.DATA.freeze, 'FF')
		assert.equal(self.DATA.freeze_type, 'FF')
	})

	test('non-hex value at 020500 does not set freeze', () => {
		const self = makeSelf({ freeze: 'FF', freeze_type: 'FF' })
		feed(self, 'DTH:020500,GG;')
		assert.equal(self.DATA.freeze, 'FF')
		assert.equal(self.DATA.freeze_type, 'FF')
	})

	test('non-hex at 020501 does not set freeze_type', () => {
		const self = makeSelf({ freeze_type: 'FF' })
		feed(self, 'DTH:020501,GG;')
		assert.equal(self.DATA.freeze_type, 'FF')
	})

	test('non-hex at 020502 does not set freeze_select_02', () => {
		const self = makeSelf({ freeze_select_02: 'FF' })
		feed(self, 'DTH:020502,GG;')
		assert.equal(self.DATA.freeze_select_02, 'FF')
	})

	test('malformed block does not partially overwrite: all fields unchanged', () => {
		const self = makeSelf({
			freeze: '01',
			freeze_type: '01',
			freeze_select_02: '01',
			freeze_select_0A: '01',
			freeze_select_11: '01',
		})
		// 5-byte (10 hex chars) — neither 18-byte nor 1-byte
		feed(self, 'DTH:020500,0101010101;')
		assert.equal(self.DATA.freeze, '01') // unchanged
		assert.equal(self.DATA.freeze_type, '01') // unchanged
		assert.equal(self.DATA.freeze_select_02, '01') // unchanged
		assert.equal(self.DATA.freeze_select_0A, '01') // unchanged
		assert.equal(self.DATA.freeze_select_11, '01') // unchanged
	})
})

// ── DTH handler — unrelated addresses not affected ───────────────────────────

describe('DTH handler — unrelated addresses do not affect freeze DATA', () => {
	test('020512 does not set any freeze fields', () => {
		const self = makeSelf({ freeze: '01', freeze_type: '00', freeze_select_11: '01' })
		feed(self, 'DTH:020512,01;')
		assert.equal(self.DATA.freeze, '01')
		assert.equal(self.DATA.freeze_type, '00')
		assert.equal(self.DATA.freeze_select_11, '01')
	})

	test('existing aux source handler (000011) still works', () => {
		const self = makeSelf({})
		feed(self, 'DTH:000011,05;')
		assert.equal(self.DATA.aux1source, '05')
	})

	test('existing aux link handler (020154) still works', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020154,01;')
		assert.equal(self.DATA.aux1link, '01')
	})
})
