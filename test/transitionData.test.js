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

// ── getTransitionData — polling command ──────────────────────────────────────

describe('getTransitionData — sends correct RQH command', () => {
	test('sends RQH:001800,000004 as 4-byte block read', () => {
		const sent = []
		const self = Object.assign(Object.create(api), {
			config: {},
			socket: { isConnected: true, send: (cmd) => sent.push(cmd) },
			log: () => {},
		})
		self.getTransitionData()
		assert.ok(
			sent.some((c) => c.includes('RQH:001800,000004')),
			'RQH:001800,000004 not sent',
		)
	})
})

// ── DTH handler — 4-byte block response (address 001800) ─────────────────────

describe('DTH handler — 4-byte block sets all transition DATA', () => {
	test('all four bytes parsed and stored as integers', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,01020103;')
		assert.equal(self.DATA.transitiontype, 1) // 01
		assert.equal(self.DATA.mixtype, 2) // 02
		assert.equal(self.DATA.wipetype, 1) // 01
		assert.equal(self.DATA.wipedirection, 3) // 03
	})

	test('all-zero block', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,00000000;')
		assert.equal(self.DATA.transitiontype, 0)
		assert.equal(self.DATA.mixtype, 0)
		assert.equal(self.DATA.wipetype, 0)
		assert.equal(self.DATA.wipedirection, 0)
	})

	test('max representable values', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,01020702;')
		// 01=Wipe, 02=Nam, 07=V-Center, 02=Round Trip
		assert.equal(self.DATA.transitiontype, 1)
		assert.equal(self.DATA.mixtype, 2)
		assert.equal(self.DATA.wipetype, 7)
		assert.equal(self.DATA.wipedirection, 2)
	})

	test('byte order: first byte is transition type', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,01000000;')
		assert.equal(self.DATA.transitiontype, 1) //Wipe
		assert.equal(self.DATA.mixtype, 0)
		assert.equal(self.DATA.wipetype, 0)
		assert.equal(self.DATA.wipedirection, 0)
	})

	test('byte order: second byte is mix type', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,00020000;')
		assert.equal(self.DATA.transitiontype, 0)
		assert.equal(self.DATA.mixtype, 2) //Nam
		assert.equal(self.DATA.wipetype, 0)
		assert.equal(self.DATA.wipedirection, 0)
	})

	test('byte order: third byte is wipe type', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,00000700;')
		assert.equal(self.DATA.wipetype, 7) //V-Center
	})

	test('byte order: fourth byte is wipe direction', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,00000002;')
		assert.equal(self.DATA.wipedirection, 2) //Round Trip
	})

	test('lowercased hex is accepted', () => {
		const self = makeSelf({})
		feed(self, 'DTH:001800,01020103;')
		assert.equal(self.DATA.transitiontype, 1)
		assert.equal(self.DATA.wipedirection, 3)
	})
})

// ── DTH handler — single-byte fallback at 001800 ─────────────────────────────

describe('DTH handler — single-byte PGM notification at 001800', () => {
	test('1-byte updates transitiontype only', () => {
		const self = makeSelf({ mixtype: 2, wipetype: 3, wipedirection: 1 })
		feed(self, 'DTH:001800,01;')
		assert.equal(self.DATA.transitiontype, 1)
		assert.equal(self.DATA.mixtype, 2) // unchanged
		assert.equal(self.DATA.wipetype, 3) // unchanged
		assert.equal(self.DATA.wipedirection, 1) // unchanged
	})

	test('all-zero single byte', () => {
		const self = makeSelf({ transitiontype: 1 })
		feed(self, 'DTH:001800,00;')
		assert.equal(self.DATA.transitiontype, 0)
	})
})

// ── DTH handler — single-byte notifications 001801–001803 ────────────────────

describe('DTH handler — mix type notification (001801)', () => {
	test('updates mixtype only', () => {
		const self = makeSelf({ transitiontype: 1, wipetype: 3, wipedirection: 0 })
		feed(self, 'DTH:001801,02;')
		assert.equal(self.DATA.mixtype, 2)
		assert.equal(self.DATA.transitiontype, 1) // unchanged
		assert.equal(self.DATA.wipetype, 3) // unchanged
	})
})

describe('DTH handler — wipe type notification (001802)', () => {
	test('updates wipetype only', () => {
		const self = makeSelf({ transitiontype: 1, mixtype: 0, wipedirection: 0 })
		feed(self, 'DTH:001802,07;')
		assert.equal(self.DATA.wipetype, 7)
		assert.equal(self.DATA.transitiontype, 1) // unchanged
		assert.equal(self.DATA.mixtype, 0) // unchanged
	})
})

describe('DTH handler — wipe direction notification (001803)', () => {
	test('updates wipedirection only', () => {
		const self = makeSelf({ transitiontype: 0, mixtype: 0, wipetype: 0 })
		feed(self, 'DTH:001803,02;')
		assert.equal(self.DATA.wipedirection, 2)
		assert.equal(self.DATA.wipetype, 0) // unchanged
	})
})

// ── DTH handler — malformed values are rejected ──────────────────────────────

describe('DTH handler — malformed values rejected at 001800', () => {
	test('3-byte value does not set any transition DATA', () => {
		const self = makeSelf({ transitiontype: 9, mixtype: 9, wipetype: 9, wipedirection: 9 })
		feed(self, 'DTH:001800,010203;')
		assert.equal(self.DATA.transitiontype, 9)
		assert.equal(self.DATA.mixtype, 9)
		assert.equal(self.DATA.wipetype, 9)
		assert.equal(self.DATA.wipedirection, 9)
	})

	test('5-byte value does not set any transition DATA', () => {
		const self = makeSelf({ transitiontype: 9, mixtype: 9, wipetype: 9, wipedirection: 9 })
		feed(self, 'DTH:001800,0102030405;')
		assert.equal(self.DATA.transitiontype, 9)
		assert.equal(self.DATA.mixtype, 9)
	})

	test('non-hex value at 001800 does not set any DATA', () => {
		const self = makeSelf({ transitiontype: 9, mixtype: 9, wipetype: 9, wipedirection: 9 })
		feed(self, 'DTH:001800,GGGG;')
		assert.equal(self.DATA.transitiontype, 9)
		assert.equal(self.DATA.mixtype, 9)
		assert.equal(self.DATA.wipetype, 9)
		assert.equal(self.DATA.wipedirection, 9)
	})

	test('non-hex value at 001801 does not set mixtype', () => {
		const self = makeSelf({ mixtype: 9 })
		feed(self, 'DTH:001801,GG;')
		assert.equal(self.DATA.mixtype, 9)
	})

	test('non-hex value at 001802 does not set wipetype', () => {
		const self = makeSelf({ wipetype: 9 })
		feed(self, 'DTH:001802,GG;')
		assert.equal(self.DATA.wipetype, 9)
	})

	test('non-hex value at 001803 does not set wipedirection', () => {
		const self = makeSelf({ wipedirection: 9 })
		feed(self, 'DTH:001803,GG;')
		assert.equal(self.DATA.wipedirection, 9)
	})
})

// ── DTH handler — unrelated addresses not affected ───────────────────────────

describe('DTH handler — unrelated addresses do not affect transition DATA', () => {
	test('001804 (wipe border color) does not set transitiontype–wipedirection', () => {
		const self = makeSelf({ transitiontype: 1, mixtype: 2, wipetype: 3, wipedirection: 1 })
		feed(self, 'DTH:001804,05;')
		assert.equal(self.DATA.transitiontype, 1)
		assert.equal(self.DATA.mixtype, 2)
		assert.equal(self.DATA.wipetype, 3)
		assert.equal(self.DATA.wipedirection, 1)
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
})
