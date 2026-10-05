// Messages of Import from MDA (a web-only feature: MDA has no import screen, so these follow
// the style of MDA's own company messages, e.g. `Year "X" already exists for this company`).

export const importMessages = {
  noRegistry: 'MDA_Registry.db not found in the selected folder',
  nothing: 'No MDA companies found in the selected folder',
  imported: (name: string, years: number) =>
    `Company "${name}" imported (${years} ${years === 1 ? 'year' : 'years'})`,
  exists: (name: string) => `Company "${name}" already exists`,
};
