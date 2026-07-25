function classifyChange(indexStatus, workTreeStatus, conflicted = false) {
  const combined = `${indexStatus}${workTreeStatus}`;
  if (conflicted || /U/.test(combined) || ['DD', 'AU', 'UD', 'UA', 'DU', 'AA'].includes(combined)) {
    return 'conflicted';
  }
  if (combined.includes('R')) return 'renamed';
  if (combined.includes('C')) return 'copied';
  if (combined.includes('A')) return 'added';
  if (combined.includes('D')) return 'deleted';
  if (combined.includes('T')) return 'modified';
  if (combined.includes('M')) return 'modified';
  if (combined.includes('?')) return 'untracked';
  return 'modified';
}

function createChange(path, indexStatus, workTreeStatus, previousPath = null, conflicted = false) {
  return {
    path,
    previousPath,
    indexStatus,
    workTreeStatus,
    status: classifyChange(indexStatus, workTreeStatus, conflicted),
    staged: indexStatus !== '.' && indexStatus !== '?',
    unstaged: workTreeStatus !== '.',
  };
}

export function parsePorcelainV2Status(output) {
  const records = String(output ?? '').split('\0');
  const result = {
    head: null,
    branch: null,
    detached: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: [],
  };

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;

    if (record.startsWith('# branch.head ')) {
      const branch = record.slice('# branch.head '.length);
      result.detached = branch === '(detached)';
      result.branch = result.detached ? null : branch;
      continue;
    }
    if (record.startsWith('# branch.oid ')) {
      const head = record.slice('# branch.oid '.length);
      result.head = head === '(initial)' ? null : head || null;
      continue;
    }
    if (record.startsWith('# branch.upstream ')) {
      result.upstream = record.slice('# branch.upstream '.length) || null;
      continue;
    }
    if (record.startsWith('# branch.ab ')) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);
      if (match) {
        result.ahead = Number.parseInt(match[1], 10);
        result.behind = Number.parseInt(match[2], 10);
      }
      continue;
    }
    if (record.startsWith('? ')) {
      result.changes.push(createChange(record.slice(2), '?', '?'));
      continue;
    }
    if (record.startsWith('! ')) continue;

    const ordinary = /^1 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/s.exec(record);
    if (ordinary) {
      result.changes.push(createChange(ordinary[2], ordinary[1][0], ordinary[1][1]));
      continue;
    }

    const renamed = /^2 ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/s.exec(record);
    if (renamed) {
      const previousPath = records[index + 1] || null;
      index += 1;
      result.changes.push(createChange(renamed[2], renamed[1][0], renamed[1][1], previousPath));
      continue;
    }

    const unmerged = /^u ([^ ]{2}) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/s.exec(record);
    if (unmerged) {
      result.changes.push(createChange(unmerged[2], unmerged[1][0], unmerged[1][1], null, true));
    }
  }

  return result;
}

export function parseGitHistory(output) {
  const fields = String(output ?? '').split('\0');
  if (fields.at(-1) === '') fields.pop();

  const history = [];
  for (let index = 0; index + 4 < fields.length; index += 5) {
    history.push({
      hash: fields[index],
      shortHash: fields[index + 1],
      subject: fields[index + 2],
      author: fields[index + 3],
      authoredAt: fields[index + 4],
    });
  }
  return history;
}
