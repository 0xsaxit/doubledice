import {
  Address,
  BigDecimal,
  BigInt
} from '@graphprotocol/graph-ts';
import {
  Category,
  Opponent,
  Outcome,
  OutcomeTimeslot,
  ResultSource,
  Subcategory,
  User,
  UserOutcome as OutcomeUser,
  UserOutcomeTimeslot as OutcomeTimeslotUser,
  UserVirtualFloor as VfUser,
  VirtualFloor
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
  outcome: Outcome,
  timeslot: BigInt,
  tokenId: BigInt,
  beta: BigDecimal,
): OutcomeTimeslot {
  const id = genVfOutcomeTimeslotEntityId(tokenId);
  const loaded = OutcomeTimeslot.load(id);
  if (loaded == null) {
    const created = new OutcomeTimeslot(id);
    {
      created.outcome = outcome.id;
      created.timeslot = timeslot;
      created.tokenId = tokenId;
      created.beta = beta;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('OutcomeTimeslot', id, 'outcome', loaded.outcome, outcome.id);
      assertFieldEqual('OutcomeTimeslot', id, 'timeslot', loaded.timeslot, timeslot);
      assertFieldEqual('OutcomeTimeslot', id, 'tokenId', loaded.tokenId, tokenId);
      assertFieldEqual('OutcomeTimeslot', id, 'beta', loaded.beta, beta);
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


export function assertOutcomeUserEntity(outcome: Outcome, user: User): OutcomeUser {
  const id = `${outcome.id}-${user.id}`;
  const loaded = OutcomeUser.load(id);
  if (loaded == null) {
    const created = new OutcomeUser(id);
    {
      created.outcome = outcome.id;
      created.user = user.id;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('OutcomeUser', id, 'outcome', loaded.outcome, outcome.id);
      assertFieldEqual('OutcomeUser', id, 'user', loaded.user, user.id);
    }
    return loaded;
  }
}

export function assertOutcomeTimeslotUserEntity(
  outcome: Outcome,
  user: User,
  outcomeTimeslot: OutcomeTimeslot,
  outcomeUser: OutcomeUser,
): OutcomeTimeslotUser {
  {
    assertFieldEqual('OutcomeTimeslot', outcomeTimeslot.id, 'outcome', outcomeTimeslot.outcome, outcome.id);
    assertFieldEqual('OutcomeUser', outcomeUser.id, 'outcome', outcomeUser.outcome, outcome.id);
    assertFieldEqual('OutcomeUser', outcomeUser.id, 'user', outcomeUser.user, user.id);
  }
  const id = `${outcomeTimeslot.id}-${user.id}`;
  const loaded = OutcomeTimeslotUser.load(id);
  if (loaded == null) {
    const created = new OutcomeTimeslotUser(id);
    {
      created.user = user.id;
      created.outcome = outcome.id;
      created.userOutcome = outcomeUser.id;
      created.outcomeTimeslot = outcomeTimeslot.id;
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('UserOutcomeTimeslot', id, 'user', loaded.user, user.id);
      assertFieldEqual('UserOutcomeTimeslot', id, 'outcome', loaded.outcome, outcome.id);
      assertFieldEqual('UserOutcomeTimeslot', id, 'userOutcome', loaded.userOutcome, outcomeUser.id);
      assertFieldEqual('UserOutcomeTimeslot', id, 'outcomeTimeslot', loaded.outcomeTimeslot, outcomeTimeslot.id);
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
export function assertVfUserEntity(vf: VirtualFloor, user: User): VfUser {
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

export function createVfOpponentEntity(vf: VirtualFloor, opponentIndex: i32, title: string, image: string): Opponent {
  const id = `${vf.id}-${opponentIndex}`;
  const opponent = createNewEntity<Opponent>(Opponent.load, id);
  opponent.virtualFloor = vf.id;
  opponent.title = title;
  opponent.image = image;
  opponent.save();
  return opponent;
}

export function createVfResultSourceEntity(vf: VirtualFloor, resultSourceIndex: i32, title: string, url: string): ResultSource {
  const id = `${vf.id}-${resultSourceIndex}`;
  const resultSource = createNewEntity<ResultSource>(ResultSource.load, id);
  resultSource.virtualFloor = vf.id;
  resultSource.title = title;
  resultSource.url = url;
  resultSource.save();
  return resultSource;
}

export function createVfOutcomeEntity(vf: VirtualFloor, outcomeIndex: i32, title: string): Outcome {
  const id = `${vf.id}-${outcomeIndex}`;
  const outcome = createNewEntity<Outcome>(Outcome.load, id);
  outcome.virtualFloor = vf.id;
  outcome.title = title;
  outcome.index = outcomeIndex;
  outcome.save();
  return outcome;
}

export function genVfEntityId(vfId: BigInt): string {
  return vfId.toHex();
}

export function genVfOutcomeTimeslotEntityId(tokenId: BigInt): string {
  return tokenId.toHex();
}

export function loadExistentVfEntity(vfId: BigInt): VirtualFloor {
  return loadExistentEntity<VirtualFloor>(VirtualFloor.load, genVfEntityId(vfId));
}

export function loadExistentVfOutcomeEntity(vfId: BigInt, outcomeIndex: i32): Outcome {
  const vfEntity = loadExistentVfEntity(vfId);
  return loadExistentEntity<Outcome>(Outcome.load, `${vfEntity.id}-${outcomeIndex}`);
}
