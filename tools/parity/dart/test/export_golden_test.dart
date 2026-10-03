// Golden fixture exporter.
//
// Runs the pure functions of MDA-Inventory over a fixed, seeded set of inputs
// and writes the inputs together with Dart's outputs to ../golden/*.json.
// The TypeScript port (@qi/core) must reproduce every output exactly.
//
// Run from this folder:  flutter test test/export_golden_test.dart
// The seed is fixed, so re-running produces identical files.

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:mda_inventory/posting_service.dart';
import 'package:mda_inventory/purchase_service.dart';
import 'package:mda_inventory/sale_service.dart';
import 'package:mda_inventory/security.dart';
import 'package:mda_inventory/voucher_print.dart' show amountInWords;

final _rng = Random(20261002);
const _outDir = '../golden';

const _gstRates = [0.0, 0.25, 1.5, 3.0, 5.0, 6.0, 9.0, 12.0, 18.0, 28.0];

double _pick(List<double> xs) => xs[_rng.nextInt(xs.length)];
double _money(int maxRupees) => _rng.nextInt(maxRupees * 100) / 100;
double _qty() => switch (_rng.nextInt(4)) {
      0 => (_rng.nextInt(50) + 1).toDouble(),
      1 => _rng.nextInt(100000) / 1000, // 3 decimals
      2 => _rng.nextInt(1000) / 100,
      _ => (_rng.nextInt(5) + 1) * 0.5,
    };

Map<String, Object?> _lineInput() {
  final usePct = _rng.nextInt(3) == 0;
  final useAmt = !usePct && _rng.nextInt(3) == 0;
  final qty = _qty();
  final rate = _money(5000);
  return {
    'qty': qty,
    'rate': rate,
    'discPct': usePct ? _pick(const [2.5, 5, 7.5, 10, 12.5, 15, 33.33, 100]) : 0.0,
    'discAmt': useAmt ? _money(max(1, (qty * rate / 4).floor() + 1)) : 0.0,
    'gstRate': _pick(_gstRates),
    'interState': _rng.nextBool(),
  };
}

const _lineEdgeCases = <Map<String, Object?>>[
  {'qty': 1.0, 'rate': 0.05, 'discPct': 0.0, 'discAmt': 0.0, 'gstRate': 5.0, 'interState': false},
  {'qty': 3.0, 'rate': 33.33, 'discPct': 0.0, 'discAmt': 0.0, 'gstRate': 18.0, 'interState': false},
  {'qty': 0.001, 'rate': 999.99, 'discPct': 0.0, 'discAmt': 0.0, 'gstRate': 28.0, 'interState': true},
  {'qty': 7.0, 'rate': 14.29, 'discPct': 100.0, 'discAmt': 0.0, 'gstRate': 12.0, 'interState': false},
  {'qty': 2.0, 'rate': 10.0, 'discPct': 0.0, 'discAmt': 25.0, 'gstRate': 18.0, 'interState': false},
  {'qty': 1.0, 'rate': 100.0, 'discPct': 0.0, 'discAmt': 0.0, 'gstRate': 0.25, 'interState': false},
  {'qty': 1.0, 'rate': 1.0, 'discPct': 0.0, 'discAmt': 0.0, 'gstRate': 1.5, 'interState': false},
  {'qty': 12.5, 'rate': 80.4, 'discPct': 2.5, 'discAmt': 0.0, 'gstRate': 5.0, 'interState': true},
];

Map<String, Object?> _gst(Map<String, Object?> i, GstSplit s) => {
      'input': i,
      'output': {
        'taxable': s.taxable, 'cgst': s.cgst, 'sgst': s.sgst,
        'igst': s.igst, 'cess': s.cess, 'total': s.total,
      },
    };

GstSplit _compute(Map<String, Object?> i, {double cessRate = 0}) =>
    GstCalculator.compute(
      qty: i['qty'] as double,
      rate: i['rate'] as double,
      discPct: (i['discPct'] as num).toDouble(),
      discAmt: (i['discAmt'] as num).toDouble(),
      gstRate: i['gstRate'] as double,
      cessRate: cessRate,
      interState: i['interState'] as bool,
    );

Map<String, Object?> _saleLineJson(SaleLine l) => {
      'qty': l.qty, 'rate': l.rate, 'disP': l.disP, 'disA': l.disA,
      'amount': l.amount, 'sgstP': l.sgstP, 'sgstA': l.sgstA,
      'cgstP': l.cgstP, 'cgstA': l.cgstA, 'igstP': l.igstP, 'igstA': l.igstA,
      'lineTotal': l.lineTotal,
    };

Map<String, Object?> _purcLineJson(PurcLine l) => {
      'qty': l.qty, 'rate': l.rate, 'disP': l.disP, 'disA': l.disA,
      'amount': l.amount, 'sgstP': l.sgstP, 'sgstA': l.sgstA,
      'cgstP': l.cgstP, 'cgstA': l.cgstA, 'igstP': l.igstP, 'igstA': l.igstA,
      'lineTotal': l.lineTotal,
    };

SaleLine _saleLine(Map<String, Object?> i) => SaleLine.compute(
      itemCode: 'I', itemName: 'I',
      qty: i['qty'] as double, rate: i['rate'] as double,
      disP: (i['discPct'] as num).toDouble(), disA: (i['discAmt'] as num).toDouble(),
      gstRate: i['gstRate'] as double, interState: i['interState'] as bool,
    );

PurcLine _purcLine(Map<String, Object?> i) => PurcLine.compute(
      itemCode: 'I', itemName: 'I',
      qty: i['qty'] as double, rate: i['rate'] as double,
      disP: (i['discPct'] as num).toDouble(), disA: (i['discAmt'] as num).toDouble(),
      gstRate: i['gstRate'] as double, interState: i['interState'] as bool,
    );

void _write(String name, Object data) {
  final file = File('$_outDir/$name.json');
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(const JsonEncoder.withIndent(' ').convert(data));
}

// A random string that matches the GSTIN shape, without the check digit.
String _gstinBody() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const alnum = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  String l(int n) => List.generate(n, (_) => letters[_rng.nextInt(26)]).join();
  String d(int n) => List.generate(n, (_) => '${_rng.nextInt(10)}').join();
  final state = (_rng.nextInt(37) + 1).toString().padLeft(2, '0');
  return '$state${l(5)}${d(4)}${l(1)}${alnum[_rng.nextInt(alnum.length)]}Z';
}

void main() {
  test('export golden fixtures', () {
    // ── round2 / roundOff ────────────────────────────────────────────────────
    final roundInputs = <double>[
      0, 0.005, 0.015, 0.125, -0.125, -0.005, -0.015, 1.005, 2.675, -2.675,
      0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 100.495, -100.495, 99.995, 12345.675,
      for (var k = 0; k < 300; k++) (_rng.nextInt(2000000) - 1000000) / 1000,
    ];
    _write('round', [
      for (final v in roundInputs)
        {'input': v, 'round2': GstCalculator.round2(v), 'roundOff': GstCalculator.roundOff(v)},
    ]);

    // ── isInterState ─────────────────────────────────────────────────────────
    const stateCases = [
      ['27', '27'], ['27', '29'], ['', '27'], ['27', ''], ['', ''],
      [' 27 ', '27'], ['07', '7'], ['27', ' 29'],
    ];
    _write('inter_state', [
      for (final c in stateCases)
        {'company': c[0], 'party': c[1], 'output': GstCalculator.isInterState(c[0], c[1])},
    ]);

    // ── GstCalculator.compute ────────────────────────────────────────────────
    final lineInputs = [..._lineEdgeCases, for (var k = 0; k < 1500; k++) _lineInput()];
    _write('gst_compute', [
      for (final i in lineInputs) _gst(i, _compute(i)),
      // Cess is never passed by sale/purchase today, but the calculator supports it.
      for (final i in lineInputs.take(50))
        {..._gst(i, _compute(i, cessRate: 1)), 'cessRate': 1.0},
    ]);

    // ── SaleLine / PurcLine ──────────────────────────────────────────────────
    _write('sale_line', [
      for (final i in lineInputs) {'input': i, 'output': _saleLineJson(_saleLine(i))},
    ]);
    _write('purchase_line', [
      for (final i in lineInputs) {'input': i, 'output': _purcLineJson(_purcLine(i))},
    ]);

    // ── SaleTotals / PurcTotals ──────────────────────────────────────────────
    final saleTotals = <Object>[];
    final purcTotals = <Object>[];
    for (var k = 0; k < 400; k++) {
      final inter = _rng.nextBool();
      final inputs = [
        for (var n = 0; n < _rng.nextInt(8) + 1; n++) {..._lineInput(), 'interState': inter},
      ];
      final billPct = _rng.nextInt(4) == 0 ? _pick(const [1, 2.5, 5, 10]) : 0.0;
      final billAmt = billPct == 0 && _rng.nextInt(4) == 0 ? _money(200) : 0.0;

      final sl = inputs.map(_saleLine).toList();
      final st = SaleTotals.of(sl, billDiscPct: billPct, billDiscAmt: billAmt);
      saleTotals.add({
        'lines': inputs, 'billDiscPct': billPct, 'billDiscAmt': billAmt,
        'output': {
          'qty': st.qty, 'subTotal': st.subTotal, 'itemDisc': st.itemDisc,
          'billDisc': st.billDisc, 'sgst': st.sgst, 'cgst': st.cgst,
          'igst': st.igst, 'roundOff': st.roundOff, 'net': st.net,
        },
      });

      final pt = PurcTotals.of(inputs.map(_purcLine).toList());
      purcTotals.add({
        'lines': inputs,
        'output': {
          'qty': pt.qty, 'subTotal': pt.subTotal, 'discount': pt.discount,
          'sgst': pt.sgst, 'cgst': pt.cgst, 'igst': pt.igst,
          'roundOff': pt.roundOff, 'net': pt.net,
        },
      });
    }
    _write('sale_totals', saleTotals);
    _write('purchase_totals', purcTotals);

    // ── Validators ───────────────────────────────────────────────────────────
    final gstins = <String>[
      '', '27AAPFU0939F1ZV', '27aapfu0939f1zv', '27AAPFU0939F1Z', '27AAPFU0939F1ZX',
      '29ABCDE1234F1Z5', 'ABCDEFGHIJKLMNO', '27AAPFU0939F0ZV',
    ];
    for (var k = 0; k < 150; k++) {
      final body = _gstinBody();
      // Every possible check character: exactly one is valid.
      final valid = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          .split('')
          .map((c) => '$body$c')
          .firstWhere((g) => Validators.gstin(g) == null, orElse: () => '');
      if (valid.isNotEmpty) gstins.add(valid);
      gstins.add('$body${_rng.nextInt(10)}'); // usually invalid
    }
    String? v(String? Function() f) => f();
    _write('validators', {
      'gstin': [
        for (final g in gstins) ...[
          {'input': g, 'required': false, 'output': v(() => Validators.gstin(g))},
          {'input': g, 'required': true, 'output': v(() => Validators.gstin(g, required: true))},
        ],
      ],
      'pan': [
        for (final p in ['', 'ABCDE1234F', 'abcde1234f', 'ABCD1234F', 'ABCDE12345', ' ABCDE1234F '])
          {'input': p, 'output': Validators.pan(p), 'outputRequired': Validators.pan(p, required: true)},
      ],
      'hsn': [
        for (final h in ['', '1234', '12345678', '123', '123456789', '12AB', ' 9988 '])
          {'input': h, 'output': Validators.hsn(h), 'outputRequired': Validators.hsn(h, required: true)},
      ],
      'mobile': [
        for (final m in ['', '9876543210', '5876543210', '987654321', '98765432101', '+919876543210'])
          {'input': m, 'output': Validators.mobile(m), 'outputRequired': Validators.mobile(m, required: true)},
      ],
      'email': [
        for (final e in ['', 'a@b.co', 'a@b', 'a b@c.com', 'x@y.z', '@b.com'])
          {'input': e, 'output': Validators.email(e), 'outputRequired': Validators.email(e, required: true)},
      ],
      'pincode': [
        for (final p in ['', '411001', '011001', '41100', '4110011', 'ABCDEF'])
          {'input': p, 'output': Validators.pincode(p), 'outputRequired': Validators.pincode(p, required: true)},
      ],
      'stateCodeFromGstin': [
        for (final g in ['', '2', '27AAPFU0939F1ZV', ' 27'])
          {'input': g, 'output': Validators.stateCodeFromGstin(g)},
      ],
    });

    // ── Amount in words ──────────────────────────────────────────────────────
    final amounts = <double>[
      0, 0.5, 1, 1.01, 10.1, 19, 20, 99.99, 100, 101, 999, 1000, 1001, 99999,
      100000, 100001, 1234567.89, 9999999, 10000000, 10000001, 123456789.12,
      1000000000, 25.29, 0.07,
      for (var k = 0; k < 200; k++) _rng.nextInt(1000000000) / 100,
    ];
    _write('amount_in_words', [
      for (final a in amounts) {'input': a, 'output': amountInWords(a)},
    ]);

    // ── Password hashes (verify only — salts are random by design) ──────────
    final hashes = <Object>[];
    for (final pw in ['admin', 'Secret@123', 'pässwörd', '1234']) {
      hashes.add({'password': pw, 'stored': PasswordHasher.hash(pw)});
    }
    hashes.add({'password': 'plain', 'stored': 'plain'}); // legacy plain text
    _write('password_hashes', hashes);
  });
}
