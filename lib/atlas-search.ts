export type SearchPerson = {
  id: string; name: string; search_terms?: string; summary?: string | null;
};

export function normalizeSearch(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

export function indexPeople<T extends SearchPerson>(people: T[]) {
  return people.map(person => ({
    person,
    name: normalizeSearch(person.name),
    text: normalizeSearch([person.name, person.search_terms, person.summary].filter(Boolean).join(' ')),
  }));
}

/** Use the full directory, independently of the selected year's office holders. */
export function searchPeople<T extends SearchPerson>(index: ReturnType<typeof indexPeople<T>>, query: string) {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  const words = needle.split(' ');
  return index.filter(entry => words.every(word => entry.text.includes(word)))
    .map(entry => ({ person: entry.person, score: entry.name === needle ? 3 : entry.name.startsWith(needle) ? 2 : entry.name.includes(needle) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.person);
}

export function searchOfficials<T extends {title: string; institution: string; department?: string | null; rank?: string | null; duty_notes?: string | null}>(officials: T[], query: string) {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  return officials.filter(official => {
    const text = normalizeSearch([official.title, official.institution, official.department, official.rank, official.duty_notes].filter(Boolean).join(' '));
    return words.every(word => text.includes(word));
  });
}
