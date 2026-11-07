#!/usr/bin/env python3
"""
Builds help-bot-variables.json, the small search index used by Tawny's variable finder.

Inputs (all JSON, from the OWL / Condor pipeline):
  NSHD_Data_Dictionary_Public_full.json the full public data dictionary (has the restricted, sensitive and security-message columns)
  popular_vars_yr.json                  requests per variable per year (number of projects)
  projects_variables.json               approved projects and the variables each requested

Usage:
  python3 build_variable_index.py                      (reads build_variable_index.yaml next to this script)
  python3 build_variable_index.py my_settings.yaml     (reads that YAML file)
  python3 build_variable_index.py DICT.json POPULAR.json PROJECTS.json OUT.json   (paths on the command line)

The YAML file holds the four file paths and, optionally, the three tuning numbers. See build_variable_index.yaml.

Rules:
  * Only variables in the public data dictionary are included. Variables that are only on Condor are dropped.
  * Popularity is the number of projects that requested the variable (from popular_vars_yr.json).
  * No project titles, applicant names, institutions or summaries are written to the output.
  * "Requested together" suggestions are built from project variable lists and kept for variables
    requested by at least MIN_POP projects, with at most TOP_PARTNERS partners each.
"""
import json, sys, collections, datetime

MIN_POP = 5          # only give "requested together" suggestions for variables used in this many projects
TOP_PARTNERS = 5     # partners per variable
MIN_PAIR = 4         # a pair must appear in at least this many projects

def main(dict_path, pop_path, proj_path, out_path):
    dic = json.load(open(dict_path, encoding='utf-8'))
    pop = json.load(open(pop_path, encoding='utf-8'))
    pv = json.load(open(proj_path, encoding='utf-8'))

    names = [r['NSHD Variable Name'] for r in dic]
    if len(set(names)) != len(names):
        raise SystemExit('Duplicate variable names in the dictionary; fix before building.')
    index_of = {n: i for i, n in enumerate(names)}
    popn = {r['name']: int(r['total']) for r in pop}
    excluded = set(pv.get('excluded_variables', []))

    def has(r, k): return str(r.get(k, '')).strip().lower() == 'yes'

    ctxs, ctx_i = [], {}
    files, file_i = [], {}
    msgs, msg_i = [], {}
    reasons, reason_i = [], {}
    def intern(lst, idx, s):
        if s not in idx: idx[s] = len(lst); lst.append(s)
        return idx[s]

    rows = []
    for r in dic:
        parts = [r.get(k, '') for k in ('Topic', 'Subtopic 1', 'Subtopic 2', 'Subtopic 3', 'Subtopic 4')]
        import re
        parts = [re.sub(r'\s*\[\d+\]\s*$', '', p).strip() for p in parts if str(p).strip()]
        ctx = intern(ctxs, ctx_i, ' > '.join(parts))
        n = r['NSHD Variable Name']
        lib = r.get('NSHD Library File', '')
        f = intern(files, file_i, lib) if lib else -1
        flags = (1 if has(r, 'Is variable restricted?') else 0) | (2 if has(r, 'Is variable sensitive?') else 0)
        m = intern(msgs, msg_i, r['Security message'].strip()) if flags & 1 and str(r.get('Security message', '')).strip() else -1
        why = intern(reasons, reason_i, r['Reason variable is sensitive'].strip()) if flags and str(r.get('Reason variable is sensitive', '')).strip() else -1
        p = 0 if n in excluded else popn.get(n, 0)
        rows.append([n, r.get('Variable Label', '').strip(), ctx, f, str(r.get('Year of collection', '')).strip(), flags, m, why, p])

    # requested together: how often two variables were requested by the same project.
    # Uses a bit-mask of projects per variable, so very large baskets do not blow up the pair count.
    mask = collections.defaultdict(int); proj_n = 0
    for p in pv['projects']:
        vs = {v for v in p.get('variables', []) if v in index_of and v not in excluded}
        if not vs: continue
        for v in vs: mask[v] |= 1 << proj_n
        proj_n += 1
    cnt = {v: bin(m).count('1') for v, m in mask.items()}
    cand = [v for v, c in cnt.items() if c >= MIN_PAIR and popn.get(v, 0) >= MIN_POP]
    tog = {}
    for a_ in cand:
        ma = mask[a_]; best = []
        for b_ in cand:
            if b_ == a_: continue
            c = bin(ma & mask[b_]).count('1')
            if c >= MIN_PAIR:
                # cosine similarity, so variables that appear in nearly every basket do not dominate
                best.append((c / (cnt[a_] * cnt[b_]) ** 0.5, c, b_))
        best.sort(key=lambda x: (-x[0], -x[1], x[2]))
        if best: tog[index_of[a_]] = [index_of[b_] for _, _, b_ in best[:TOP_PARTNERS]]
    out = {
        'meta': {'built': datetime.date.today().isoformat(), 'variables': len(rows),
                 'projects_with_lists': proj_n,
                 'popularity': 'number of approved projects that requested the variable',
                 'popularity_years': [min(int(y) for r in pop for y in r['counts']), max(int(y) for r in pop for y in r['counts'])]},
        'ctx': ctxs, 'files': files, 'msgs': msgs, 'reasons': reasons,
        'cols': ['name', 'label', 'ctx', 'file', 'year', 'flags', 'msg', 'reason', 'projects'],
        'v': rows, 'together': tog}
    json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    dropped = [n for n in popn if n not in index_of]
    print('variables', len(rows), '| with popularity', sum(1 for r in rows if r[8]), '| restricted', sum(1 for r in rows if r[5] & 1),
          '| sensitive', sum(1 for r in rows if r[5] & 2), '| together lists', len(tog),
          '| requested but not in dictionary (left out):', len(dropped))

def read_yaml(path):
    """Reads the YAML settings file. Uses PyYAML if it is installed, otherwise a small built-in reader
    that understands the simple 'key: value' lines used in build_variable_index.yaml."""
    import os
    text = open(path, encoding='utf-8-sig').read()
    try:
        import yaml
        data = yaml.safe_load(text)
    except ImportError:
        data = {}
        for n, line in enumerate(text.splitlines(), 1):
            raw = line.strip()
            if not raw or raw.startswith('#'): continue
            if ':' not in raw: raise SystemExit('%s line %d: expected "name: value"' % (path, n))
            k, v = raw.split(':', 1)
            v = v.strip()
            if v[:1] in ('"', "'") and v.count(v[0]) >= 2: v = v[1:v.index(v[0], 1)]
            else: v = v.split(' #')[0].strip()
            data[k.strip()] = v
    if not isinstance(data, dict): raise SystemExit('%s: expected "name: value" lines' % path)
    return data


def from_yaml(path):
    import os
    global MIN_POP, TOP_PARTNERS, MIN_PAIR
    cfg = read_yaml(path)
    base = os.path.dirname(os.path.abspath(path))
    need = ['dictionary', 'popular', 'projects', 'output']
    missing = [k for k in need if not cfg.get(k)]
    if missing: raise SystemExit('%s is missing: %s' % (path, ', '.join(missing)))
    paths = {}
    for k in need:
        p = os.path.expanduser(str(cfg[k]))
        paths[k] = p if os.path.isabs(p) else os.path.join(base, p)   # relative paths are relative to the YAML file
    for k in ('dictionary', 'popular', 'projects'):
        if not os.path.exists(paths[k]): raise SystemExit('Cannot find %s file: %s' % (k, paths[k]))
    out_dir = os.path.dirname(paths['output'])
    if out_dir and not os.path.isdir(out_dir): raise SystemExit('Output folder does not exist: ' + out_dir)
    for name, var in (('min_projects_for_suggestions', 'MIN_POP'), ('suggestions_per_variable', 'TOP_PARTNERS'), ('min_projects_per_pair', 'MIN_PAIR')):
        if cfg.get(name) not in (None, ''):
            try: globals()[var] = int(cfg[name])
            except ValueError: raise SystemExit('%s: %s must be a whole number' % (path, name))
    main(paths['dictionary'], paths['popular'], paths['projects'], paths['output'])


if __name__ == '__main__':
    import os
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_variable_index.yaml')
    if len(sys.argv) == 5: main(*sys.argv[1:])
    elif len(sys.argv) == 2 and sys.argv[1].lower().endswith(('.yaml', '.yml')): from_yaml(sys.argv[1])
    elif len(sys.argv) == 1 and os.path.exists(here): from_yaml(here)
    else: raise SystemExit(__doc__)
