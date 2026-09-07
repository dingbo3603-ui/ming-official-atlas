"""Apply full careers after legacy endpoint corrections, preserving reviewed identities."""
import json
import shutil

def apply_expansions(history, assets, research):
    people={p['id']:p for p in history['people']}
    records={r['id']:r for r in history['tenures']}
    sources={s['id']:s for s in history['sources']}
    aliases={}
    def ingest_people(rows):
        for row in rows:
            if row['id'] not in people:
                people[row['id']]=row.copy()
            else:
                old=people[row['id']]
                old['source_ids']=sorted(set(old.get('source_ids',[])+row.get('source_ids',[])))
                for key in ['birth_year','death_year','cbdb']:
                    if old.get(key) is None and row.get(key) is not None: old[key]=row[key]
    for relative in ['cbdb/full-career-expansion.json','cbdb/undated-high5-full-career-extension.json',
                     'history-core-offices-complete.json','history-cabinet-complete.json']:
        path=assets/relative
        if not path.exists(): continue
        shutil.copyfile(path,research/path.name)
        bundle=json.loads(path.read_text(encoding='utf-8'))
        if isinstance(bundle.get('person_id_aliases'),dict): aliases.update(bundle['person_id_aliases'])
        sources.update({s['id']:s for s in bundle.get('sources',[])})
        ingest_people(bundle.get('people',[]))
        for patch in bundle.get('person_patches',[]):
            old=people[patch['id']]
            old['source_ids']=sorted(set(old.get('source_ids',[])+patch.get('append_source_ids',[])))
            for key in ['cbdb_person_ids','career_record_ids','cbdb_profile_supplement']:
                if key in patch: old[key]=patch[key]
        for replacement in bundle.get('record_replacements',[]):
            records.pop(replacement['old_record_id'],None)
        for row in bundle.get('tenures',bundle.get('records',[])):
            previous=records.get(row['id'],{})
            records[row['id']]={**previous,**row,'source_ids':sorted(set(previous.get('source_ids',[])+row.get('source_ids',[])))}
        for patch in bundle.get('record_patches',[]):
            old=records[patch['id']]
            retained=sorted(set(old.get('source_ids',[])+patch.get('source_ids',[])))
            old.update(patch);old['source_ids']=retained
        for key in ['empty_slots_evidence','cabinet_year_coverage']:
            if key in bundle: history[key]=bundle[key]
    for path in [assets/'cbdb/foundation-rank-refinement-patches.json',assets/'cbdb/life-boundary-corrections.json',research/'core-life-review.json']:
        if not path.exists(): continue
        if path.parent!=research: shutil.copyfile(path,research/path.name)
        bundle=json.loads(path.read_text(encoding='utf-8'))
        sources.update({s['id']:s for s in bundle.get('sources',[])})
        for key,target in [('record_patches',records),('person_patches',people)]:
            for patch in bundle.get(key,[]):
                old=target[patch['id']]
                old.update(patch.get('set',{}))
                old['source_ids']=sorted(set(old.get('source_ids',[])+patch.get('append_source_ids',[])))
    for old_id,new_id in aliases.items():
        if old_id==new_id or old_id not in people: continue
        old=people.pop(old_id)
        target=people[new_id]
        target['source_ids']=sorted(set(target.get('source_ids',[])+old.get('source_ids',[])))
        target['merged_person_ids']=sorted(set(target.get('merged_person_ids',[])+[old_id]))
        for row in records.values():
            if row['person_id']==old_id: row['person_id']=new_id
        for item in history.get('cabinet_year_coverage',[]):
            for key in ['member_ids','chief_ids']: item[key]=[new_id if value==old_id else value for value in item[key]]
    # The annual roster uses the familiar historical name, while retaining CBDB's birth name.
    if 'cbdb-person-34486' in people:
        person=people['cbdb-person-34486']
        person['aliases']=sorted(set(person.get('aliases',[])+[person['name'],'金善','金幼孜']))
        person['name']='金幼孜'
    for row in records.values():
        for key in ['start_year','end_year','attested_year']: row.setdefault(key,None)
        row.setdefault('date_note','');row.setdefault('institution','');row.setdefault('office_ids',[])
        row.setdefault('institution_ids',[])
    for p in people.values():
        if p.get('summary'):
            p['summary']=p['summary'].replace('任官资料点','任官记录').replace('任职资料点','任职记录').replace('历史资料点','历史记录')
    history['people']=list(people.values());history['tenures']=list(records.values());history['sources']=list(sources.values())
