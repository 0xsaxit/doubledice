interface Entity {
  save(): void
}

type LoadEntity<T> = (id: string) => T | null

export function createNewEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity !== null) {
    throw new Error('createNewEntity: Was not expecting the entity to already exist');
  }
  entity = instantiate<T>(id);
  entity.save();
  return entity;
}

export function loadExistentEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  const entity = load(id);
  if (entity === null) {
    throw new Error('loadExistentEntity: Was expecting entity to already exist');
  }
  return entity;
}

// ToDo: Ideally this would return { entity, isNew },
// so that caller could use isNew to run some code only the first time.
export function loadOrCreateEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity === null) {
    entity = instantiate<T>(id);
    entity.save();
  }
  return entity;
}
