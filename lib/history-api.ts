import { HISTORY_REVISION } from './history-revision';
/** Versioned reads are generated from committed MySQL data. */
export const historyApiBase = '/api/index.php?v=' + HISTORY_REVISION;
export const datasetUrl = (name: string) => historyApiBase + '&action=dataset&name=' + encodeURIComponent(name);
