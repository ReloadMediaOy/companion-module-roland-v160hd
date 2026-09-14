'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

const api = require('../src/api')

// ── _parseHexBlock ───────────────────────────────────────────────────────────

describe('_parseHexBlock — correct length and valid hex', () => {
	test('1-byte valid hex returns 1-element array', () => {
		const result = api._parseHexBlock('05', 1)
		assert.deepEqual(result, ['05'])
	})

	test('2-byte valid hex returns 2-element array', () => {
		const result = api._parseHexBlock('0512', 2)
		assert.deepEqual(result, ['05', '12'])
	})

	test('values are uppercased', () => {
		const result = api._parseHexBlock('0a1b', 2)
		assert.deepEqual(result, ['0A', '1B'])
	})

	test('all-zero block', () => {
		assert.deepEqual(api._parseHexBlock('0000', 2), ['00', '00'])
	})

	test('max valid values FF FF', () => {
		assert.deepEqual(api._parseHexBlock('FFFF', 2), ['FF', 'FF'])
	})
})

describe('_parseHexBlock — rejects invalid input', () => {
	test('too short returns null', () => {
		assert.equal(api._parseHexBlock('05', 2), null)
	})

	test('too long returns null', () => {
		assert.equal(api._parseHexBlock('051233', 2), null)
	})

	test('non-hex chars returns null', () => {
		assert.equal(api._parseHexBlock('0G', 1), null)
	})

	test('empty string returns null for expectedBytes 1', () => {
		assert.equal(api._parseHexBlock('', 1), null)
	})
})

// ── getPgmPvwData — polling command ─────────────────────────────────────────

describe('getPgmPvwData — sends correct RQH command', () => {
	test('sends RQH:002100,000002 as 2-byte block read', () => {
		const sent = []
		const self = Object.assign(Object.create(api), {
			config: {},
			socket: { isConnected: true, send: (cmd) => sent.push(cmd) },
			log: () => {},
		})
		self.getPgmPvwData()
		assert.ok(
			sent.some((c) => c.includes('RQH:002100,000002')),
			'RQH:002100,000002 not sent',
		)
	})
})

// ── DTH handler — 2-byte block response ─────────────────────────────────────

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

describe('DTH handler — 2-byte block PGM+PVW (address 002100)', () => {
	test('block response sets pgmsource and pvwsource', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002100,0512;')
		assert.equal(self.DATA.pgmsource, '05')
		assert.equal(self.DATA.pvwsource, '12')
	})

	test('block byte order: first byte is PGM, second is PVW', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002100,1A2B;')
		assert.equal(self.DATA.pgmsource, '1A')
		assert.equal(self.DATA.pvwsource, '2B')
	})

	test('all-zero block', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002100,0000;')
		assert.equal(self.DATA.pgmsource, '00')
		assert.equal(self.DATA.pvwsource, '00')
	})

	test('max values FF FF', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002100,FFFF;')
		assert.equal(self.DATA.pgmsource, 'FF')
		assert.equal(self.DATA.pvwsource, 'FF')
	})

	test('block response lowercased hex is accepted and uppercased', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002100,0a1b;')
		assert.equal(self.DATA.pgmsource, '0A')
		assert.equal(self.DATA.pvwsource, '1B')
	})
})

describe('DTH handler — single-byte PGM fallback (address 002100)', () => {
	test('1-byte notification sets pgmsource only', () => {
		const self = makeSelf({ pvwsource: '07' })
		feed(self, 'DTH:002100,05;')
		assert.equal(self.DATA.pgmsource, '05')
		assert.equal(self.DATA.pvwsource, '07') //pvwsource unchanged
	})

	test('single-byte hex is uppercased', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002100,0a;')
		assert.equal(self.DATA.pgmsource, '0A')
	})
})

describe('DTH handler — single-byte PVW notification (address 002101)', () => {
	test('1-byte notification sets pvwsource only', () => {
		const self = makeSelf({ pgmsource: '05' })
		feed(self, 'DTH:002101,12;')
		assert.equal(self.DATA.pvwsource, '12')
		assert.equal(self.DATA.pgmsource, '05') //pgmsource unchanged
	})

	test('pvw single-byte hex is uppercased', () => {
		const self = makeSelf({})
		feed(self, 'DTH:002101,0b;')
		assert.equal(self.DATA.pvwsource, '0B')
	})
})

describe('DTH handler — malformed values are rejected', () => {
	test('3-byte value at 002100 does not set pgmsource or pvwsource', () => {
		const self = makeSelf({ pgmsource: 'AA', pvwsource: 'BB' })
		feed(self, 'DTH:002100,050607;')
		assert.equal(self.DATA.pgmsource, 'AA')
		assert.equal(self.DATA.pvwsource, 'BB')
	})

	test('non-hex value at 002100 does not set pgmsource or pvwsource', () => {
		const self = makeSelf({ pgmsource: 'AA', pvwsource: 'BB' })
		feed(self, 'DTH:002100,GG;')
		assert.equal(self.DATA.pgmsource, 'AA')
		assert.equal(self.DATA.pvwsource, 'BB')
	})

	test('non-hex value at 002101 does not set pvwsource', () => {
		const self = makeSelf({ pvwsource: 'CC' })
		feed(self, 'DTH:002101,GG;')
		assert.equal(self.DATA.pvwsource, 'CC')
	})
})

describe('DTH handler — unrelated addresses not affected', () => {
	test('002102 does not set pgmsource or pvwsource', () => {
		const self = makeSelf({ pgmsource: 'AA', pvwsource: 'BB' })
		feed(self, 'DTH:002102,05;')
		assert.equal(self.DATA.pgmsource, 'AA')
		assert.equal(self.DATA.pvwsource, 'BB')
	})

	test('existing aux source handler still works after adding pgm/pvw', () => {
		const self = makeSelf({})
		feed(self, 'DTH:000011,05;')
		assert.equal(self.DATA.aux1source, '05')
	})
})
