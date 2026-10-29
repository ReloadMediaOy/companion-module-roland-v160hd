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

// ── getMonitorData — polling command ─────────────────────────────────────────

describe('getMonitorData — sends correct RQH command', () => {
	test('sends RQH:020116,000004 as 4-byte block read', () => {
		const sent = []
		const self = Object.assign(Object.create(api), {
			config: {},
			socket: { isConnected: true, send: (cmd) => sent.push(cmd) },
			log: () => {},
		})
		self.getMonitorData()
		assert.ok(
			sent.some((c) => c.includes('RQH:020116,000004')),
			'RQH:020116,000004 not sent',
		)
	})
})

// ── DTH handler — 4-byte block response (address 020116) ─────────────────────

describe('DTH handler — 4-byte block sets all monitor assign DATA', () => {
	test('all four bytes parsed and stored as uppercase hex strings', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,00010203;')
		assert.equal(self.DATA.monitor1assign, '00')
		assert.equal(self.DATA.monitor2assign, '01')
		assert.equal(self.DATA.monitor3assign, '02')
		assert.equal(self.DATA.monitor4assign, '03')
	})

	test('all-zero block', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,00000000;')
		assert.equal(self.DATA.monitor1assign, '00')
		assert.equal(self.DATA.monitor2assign, '00')
		assert.equal(self.DATA.monitor3assign, '00')
		assert.equal(self.DATA.monitor4assign, '00')
	})

	test('max valid values (0B = DSK 2 Source)', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,0B0B0B0B;')
		assert.equal(self.DATA.monitor1assign, '0B')
		assert.equal(self.DATA.monitor2assign, '0B')
		assert.equal(self.DATA.monitor3assign, '0B')
		assert.equal(self.DATA.monitor4assign, '0B')
	})

	test('byte order: first byte is monitor 1', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,04000000;')
		assert.equal(self.DATA.monitor1assign, '04') // PROGRAM
		assert.equal(self.DATA.monitor2assign, '00')
		assert.equal(self.DATA.monitor3assign, '00')
		assert.equal(self.DATA.monitor4assign, '00')
	})

	test('byte order: second byte is monitor 2', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,00050000;')
		assert.equal(self.DATA.monitor1assign, '00')
		assert.equal(self.DATA.monitor2assign, '05') // SUB PROGRAM
		assert.equal(self.DATA.monitor3assign, '00')
		assert.equal(self.DATA.monitor4assign, '00')
	})

	test('byte order: third byte is monitor 3', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,00000600;')
		assert.equal(self.DATA.monitor3assign, '06') // PREVIEW
	})

	test('byte order: fourth byte is monitor 4', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,00000007;')
		assert.equal(self.DATA.monitor4assign, '07') // AUX 1
	})

	test('lowercased hex is accepted and stored uppercase', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020116,0a0b0a0b;')
		assert.equal(self.DATA.monitor1assign, '0A')
		assert.equal(self.DATA.monitor2assign, '0B')
		assert.equal(self.DATA.monitor3assign, '0A')
		assert.equal(self.DATA.monitor4assign, '0B')
	})
})

// ── DTH handler — single-byte fallback at 020116 ─────────────────────────────

describe('DTH handler — single-byte monitor 1 notification (020116)', () => {
	test('1-byte updates monitor1assign only', () => {
		const self = makeSelf({ monitor2assign: '01', monitor3assign: '02', monitor4assign: '03' })
		feed(self, 'DTH:020116,04;')
		assert.equal(self.DATA.monitor1assign, '04')
		assert.equal(self.DATA.monitor2assign, '01') // unchanged
		assert.equal(self.DATA.monitor3assign, '02') // unchanged
		assert.equal(self.DATA.monitor4assign, '03') // unchanged
	})

	test('all-zero single byte stored uppercase', () => {
		const self = makeSelf({ monitor1assign: '04' })
		feed(self, 'DTH:020116,00;')
		assert.equal(self.DATA.monitor1assign, '00')
	})
})

// ── DTH handler — single-byte notifications 020117–020119 ────────────────────

describe('DTH handler — monitor 2 assign notification (020117)', () => {
	test('updates monitor2assign only', () => {
		const self = makeSelf({ monitor1assign: '04', monitor3assign: '00', monitor4assign: '00' })
		feed(self, 'DTH:020117,05;')
		assert.equal(self.DATA.monitor2assign, '05') // SUB PROGRAM
		assert.equal(self.DATA.monitor1assign, '04') // unchanged
		assert.equal(self.DATA.monitor3assign, '00') // unchanged
	})
})

describe('DTH handler — monitor 3 assign notification (020118)', () => {
	test('updates monitor3assign only', () => {
		const self = makeSelf({ monitor1assign: '00', monitor2assign: '00', monitor4assign: '00' })
		feed(self, 'DTH:020118,06;')
		assert.equal(self.DATA.monitor3assign, '06') // PREVIEW
		assert.equal(self.DATA.monitor1assign, '00') // unchanged
		assert.equal(self.DATA.monitor2assign, '00') // unchanged
	})
})

describe('DTH handler — monitor 4 assign notification (020119)', () => {
	test('updates monitor4assign only', () => {
		const self = makeSelf({ monitor1assign: '00', monitor2assign: '00', monitor3assign: '00' })
		feed(self, 'DTH:020119,07;')
		assert.equal(self.DATA.monitor4assign, '07') // AUX 1
		assert.equal(self.DATA.monitor3assign, '00') // unchanged
	})
})

// ── DTH handler — malformed values rejected ───────────────────────────────────

describe('DTH handler — malformed values rejected at 020116', () => {
	test('3-byte value does not set any monitor DATA', () => {
		const self = makeSelf({ monitor1assign: 'FF', monitor2assign: 'FF', monitor3assign: 'FF', monitor4assign: 'FF' })
		feed(self, 'DTH:020116,010203;')
		assert.equal(self.DATA.monitor1assign, 'FF')
		assert.equal(self.DATA.monitor2assign, 'FF')
		assert.equal(self.DATA.monitor3assign, 'FF')
		assert.equal(self.DATA.monitor4assign, 'FF')
	})

	test('5-byte value does not set any monitor DATA', () => {
		const self = makeSelf({ monitor1assign: 'FF', monitor2assign: 'FF', monitor3assign: 'FF', monitor4assign: 'FF' })
		feed(self, 'DTH:020116,0102030405;')
		assert.equal(self.DATA.monitor1assign, 'FF')
		assert.equal(self.DATA.monitor2assign, 'FF')
	})

	test('non-hex value at 020116 does not set any monitor DATA', () => {
		const self = makeSelf({ monitor1assign: 'FF', monitor2assign: 'FF', monitor3assign: 'FF', monitor4assign: 'FF' })
		feed(self, 'DTH:020116,GGGG;')
		assert.equal(self.DATA.monitor1assign, 'FF')
		assert.equal(self.DATA.monitor2assign, 'FF')
		assert.equal(self.DATA.monitor3assign, 'FF')
		assert.equal(self.DATA.monitor4assign, 'FF')
	})

	test('non-hex at 020117 does not set monitor2assign', () => {
		const self = makeSelf({ monitor2assign: 'FF' })
		feed(self, 'DTH:020117,GG;')
		assert.equal(self.DATA.monitor2assign, 'FF')
	})

	test('non-hex at 020118 does not set monitor3assign', () => {
		const self = makeSelf({ monitor3assign: 'FF' })
		feed(self, 'DTH:020118,GG;')
		assert.equal(self.DATA.monitor3assign, 'FF')
	})

	test('non-hex at 020119 does not set monitor4assign', () => {
		const self = makeSelf({ monitor4assign: 'FF' })
		feed(self, 'DTH:020119,GG;')
		assert.equal(self.DATA.monitor4assign, 'FF')
	})
})

// ── DTH handler — unrelated addresses not affected ───────────────────────────

describe('DTH handler — unrelated addresses do not affect monitor DATA', () => {
	test('02011A does not set any monitor assign', () => {
		const self = makeSelf({ monitor1assign: '04', monitor2assign: '05', monitor3assign: '06', monitor4assign: '07' })
		feed(self, 'DTH:02011A,01;')
		assert.equal(self.DATA.monitor1assign, '04')
		assert.equal(self.DATA.monitor2assign, '05')
		assert.equal(self.DATA.monitor3assign, '06')
		assert.equal(self.DATA.monitor4assign, '07')
	})

	test('existing aux source handler (000011) still works', () => {
		const self = makeSelf({})
		feed(self, 'DTH:000011,05;')
		assert.equal(self.DATA.aux1source, '05')
	})

	test('existing freeze handler (020500) still works', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020500,01;')
		assert.equal(self.DATA.freeze, '01')
	})

	test('existing aux link handler (020154) still works', () => {
		const self = makeSelf({})
		feed(self, 'DTH:020154,01;')
		assert.equal(self.DATA.aux1link, '01')
	})
})
