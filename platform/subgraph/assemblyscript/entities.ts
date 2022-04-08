import {
  Address,
  BigDecimal,
  BigInt
} from '@graphprotocol/graph-ts';
import {
  Category,
  Opponent as VfOpponent,
  Outcome as VfOutcome,
  OutcomeTimeslot as VfOutcomeTimeslot,
  ResultSource as VfResultSource,
  Subcategory,
  User,
  UserOutcome as VfOutcomeUser,
  UserOutcomeTimeslot as VfOutcomeTimeslotUser,
  UserVirtualFloor as VfUser,
  VirtualFloor as Vf
} from '../../generated/schema';

interface Entity {
  save(): void
}

type LoadEntity<T> = (id: string) => T | null

export function createNewEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  assert(entity == null, `createNewEntity: Expected entity ${id} to NOT already exist`);
  entity = instantiate<T>(id);
  entity.save();
  return entity;
}

export function loadExistentEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  return assert(load(id), `loadExistentEntity: Expected entity ${id} to already exist`);
}

// ToDo: Ideally this would return { entity, isNew },
// so that caller could use isNew to run some code only the first time.
export function loadOrCreateEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity == null) {
    entity = instantiate<T>(id);
    entity.save();
  }
  return entity;
}

function assertFieldEqual<T>(entityName: string, id: string, fieldName: string, actualFieldValue: T, expectedFieldValue: T): void {
  // Note: Important to use == until === becomes supported
  assert(actualFieldValue == expectedFieldValue, `${entityName}(${id}).${fieldName} == ${actualFieldValue} != ${expectedFieldValue}`);
}

export function assertVfOutcomeTimeslotEntity(
  vfOutcome: VfOutcome,
  timeslot: BigInt,
  tokenId: BigInt,
  beta: BigDecimal,
): VfOutcomeTimeslot {
  const id = genVfOutcomeTimeslotEntityId(tokenId);
  const loaded = VfOutcomeTimeslot.load(id);
  if (loaded == null) {
    const created = new VfOutcomeTimeslot(id);
    {
      created.outcome = vfOutcome.id;
      created.timeslot = timeslot;
      created.tokenId = tokenId;
      created.beta = beta;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('VfOutcomeTimeslot', id, 'outcome', loaded.outcome, vfOutcome.id);
      assertFieldEqual('VfOutcomeTimeslot', id, 'timeslot', loaded.timeslot, timeslot);
      assertFieldEqual('VfOutcomeTimeslot', id, 'tokenId', loaded.tokenId, tokenId);
      assertFieldEqual('VfOutcomeTimeslot', id, 'beta', loaded.beta, beta);
    }
    return loaded;
  }
}

export function assertUserEntity(addr: Address): User {
  const id = addr.toHex();
  const loaded = User.load(id);
  if (loaded == null) {
    const created = new User(id);
    // eslint-disable-next-line no-empty
    {
    }
    created.save();
    return created;
  } else {
    // eslint-disable-next-line no-empty
    {
    }
    return loaded;
  }
}


export function assertVfOutcomeUserEntity(vfOutcome: VfOutcome, user: User): VfOutcomeUser {
  const id = `${vfOutcome.id}-${user.id}`;
  const loaded = VfOutcomeUser.load(id);
  if (loaded == null) {
    const created = new VfOutcomeUser(id);
    {
      created.outcome = vfOutcome.id;
      created.user = user.id;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('VfOutcomeUser', id, 'outcome', loaded.outcome, vfOutcome.id);
      assertFieldEqual('VfOutcomeUser', id, 'user', loaded.user, user.id);
    }
    return loaded;
  }
}

export function assertVfOutcomeTimeslotUserEntity(
  vfOutcome: VfOutcome,
  user: User,
  vfOutcomeTimeslot: VfOutcomeTimeslot,
  vfOutcomeUser: VfOutcomeUser,
): VfOutcomeTimeslotUser {
  {
    assertFieldEqual('VfOutcomeTimeslot', vfOutcomeTimeslot.id, 'outcome', vfOutcomeTimeslot.outcome, vfOutcome.id);
    assertFieldEqual('VfOutcomeUser', vfOutcomeUser.id, 'outcome', vfOutcomeUser.outcome, vfOutcome.id);
    assertFieldEqual('VfOutcomeUser', vfOutcomeUser.id, 'user', vfOutcomeUser.user, user.id);
  }
  const id = `${vfOutcomeTimeslot.id}-${user.id}`;
  const loaded = VfOutcomeTimeslotUser.load(id);
  if (loaded == null) {
    const created = new VfOutcomeTimeslotUser(id);
    {
      created.user = user.id;
      created.outcome = vfOutcome.id;
      created.userOutcome = vfOutcomeUser.id;
      created.outcomeTimeslot = vfOutcomeTimeslot.id;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('VfUserOutcomeTimeslot', id, 'user', loaded.user, user.id);
      assertFieldEqual('VfUserOutcomeTimeslot', id, 'outcome', loaded.outcome, vfOutcome.id);
      assertFieldEqual('VfUserOutcomeTimeslot', id, 'userOutcome', loaded.userOutcome, vfOutcomeUser.id);
      assertFieldEqual('VfUserOutcomeTimeslot', id, 'outcomeTimeslot', loaded.outcomeTimeslot, vfOutcomeTimeslot.id);
    }
    return loaded;
  }
}

export function assertCategoryEntity(metadataCategory: string): Category {
  // encodeURIComponent is implemented in AssemblyScript,
  // see https://github.com/AssemblyScript/assemblyscript/wiki/Status-and-Roadmap#globals
  const id = encodeURIComponent(metadataCategory);
  const slug = id; // Deprecated in favour of id
  const loaded = Category.load(id);
  if (loaded == null) {
    const created = new Category(id);
    {
      created.slug = slug;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('Category', id, 'slug', loaded.slug, slug);
    }
    return loaded;
  }
}

export function assertSubcategoryEntity(category: Category, metadataSubcategory: string): Subcategory {
  // encodeURIComponent is implemented in AssemblyScript,
  // see https://github.com/AssemblyScript/assemblyscript/wiki/Status-and-Roadmap#globals
  const subid = encodeURIComponent(metadataSubcategory);

  // Note: We use "/" as a separator instead of "-", since category and subcategory
  // might contain "-", but they will not contain "/" because they have been percent-encoded,
  // so by using "/" we rule out collisions.
  // Moreover, "/" is semantically suitable in this particular context.
  const id = `${category.id}/${subid}`;

  const slug = subid; // Deprecated in favour of subid
  const loaded = Subcategory.load(id);
  if (loaded == null) {
    const created = new Subcategory(id);
    {
      created.category = category.id;
      created.subid = subid;
      created.slug = slug;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('Subcategory', id, 'category', loaded.category, category.id);
      assertFieldEqual('Subcategory', id, 'subid', loaded.subid, subid);
      assertFieldEqual('Subcategory', id, 'slug', loaded.slug, slug);
    }
    return loaded;
  }
}

/**
 * This assertEntity function looks different from the rest,
 * but this is actually how we want all the others to look.
 */
export function assertVfUserEntity(vf: Vf, user: User): VfUser {
  const id = `${vf.id}-${user.id}`;
  const loaded = VfUser.load(id);
  if (loaded == null) {
    const created = new VfUser(id);
    {
      created.virtualFloor = vf.id;
      created.user = user.id;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('VfUser', id, 'virtualFloor', loaded.virtualFloor, vf.id);
      assertFieldEqual('VfUser', id, 'user', loaded.user, user.id);
    }
    return loaded;
  }
}

export function createVfOpponentEntity(vf: Vf, opponentIndex: i32, title: string, image: string): VfOpponent {
  const id = `${vf.id}-${opponentIndex}`;
  const vfOpponent = createNewEntity<VfOpponent>(VfOpponent.load, id);
  vfOpponent.virtualFloor = vf.id;
  vfOpponent.title = title;
  vfOpponent.image = image;
  vfOpponent.save();
  return vfOpponent;
}

export function createVfResultSourceEntity(vf: Vf, resultSourceIndex: i32, title: string, url: string): VfResultSource {
  const id = `${vf.id}-${resultSourceIndex}`;
  const vfResultSource = createNewEntity<VfResultSource>(VfResultSource.load, id);
  vfResultSource.virtualFloor = vf.id;
  vfResultSource.title = title;
  vfResultSource.url = url;
  vfResultSource.save();
  return vfResultSource;
}

export function createVfOutcomeEntity(vf: Vf, outcomeIndex: i32, title: string): VfOutcome {
  const id = `${vf.id}-${outcomeIndex}`;
  const vfOutcome = createNewEntity<VfOutcome>(VfOutcome.load, id);
  vfOutcome.virtualFloor = vf.id;
  vfOutcome.title = title;
  vfOutcome.index = outcomeIndex;
  vfOutcome.save();
  return vfOutcome;
}

export function genVfEntityId(vfId: BigInt): string {
  return vfId.toHex();
}

export function genVfOutcomeTimeslotEntityId(tokenId: BigInt): string {
  return tokenId.toHex();
}

export function loadExistentVfEntity(vfId: BigInt): Vf {
  return loadExistentEntity<Vf>(Vf.load, genVfEntityId(vfId));
}

export function loadExistentVfOutcomeEntity(vfId: BigInt, outcomeIndex: i32): VfOutcome {
  const vfEntity = loadExistentVfEntity(vfId);
  return loadExistentEntity<VfOutcome>(VfOutcome.load, `${vfEntity.id}-${outcomeIndex}`);
}
