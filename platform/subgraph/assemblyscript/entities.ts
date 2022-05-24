/* eslint-disable @typescript-eslint/ban-types */
import {
  Address,
  BigDecimal,
  BigInt,
  Bytes
} from '@graphprotocol/graph-ts';
import { IERC20Metadata } from '../../generated/DoubleDice/IERC20Metadata';
import {
  Category,
  Opponent as VfOpponent,
  Outcome as VfOutcome,
  OutcomeTimeslot as VfOutcomeTimeslot,
  PaymentToken,
  ResultSource as VfResultSource,
  Role,
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
  return entity;
}

export function loadExistentEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  return assert(load(id), `loadExistentEntity: Expected entity ${id} to already exist`);
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
    {
      created.totalSupply = BigDecimal.zero();
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
    {
      created.maxConcurrentVirtualFloors = BigInt.zero();
      created.concurrentVirtualFloors = BigInt.zero();
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


export function assertVfOutcomeUserEntity(vfOutcome: VfOutcome, user: User, vfUser: VfUser): VfOutcomeUser {
  const id = `${vfOutcome.id}-${user.id}`;
  const loaded = VfOutcomeUser.load(id);
  if (loaded == null) {
    const created = new VfOutcomeUser(id);
    {
      created.outcome = vfOutcome.id;
      created.user = user.id;
      created.userVirtualFloor = vfUser.id;
    }
    {
      created.totalBalance = BigDecimal.zero();
      created.totalClaimedBalance = BigDecimal.zero();
      created.totalBalancePlusTotalClaimedBalance = BigDecimal.zero();
      created.totalWeightedBalance = BigDecimal.zero();
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('VfOutcomeUser', id, 'outcome', loaded.outcome, vfOutcome.id);
      assertFieldEqual('VfOutcomeUser', id, 'user', loaded.user, user.id);
      assertFieldEqual('VfOutcomeUser', id, 'userVirtualFloor', loaded.userVirtualFloor, vfUser.id);
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
    {
      created.balance = BigDecimal.zero();
      created.claimedBalance = BigDecimal.zero();
      created.balancePlusClaimedBalance = BigDecimal.zero();
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
    {
      created.totalBalance = BigDecimal.zero();
      created.totalClaimedBalance = BigDecimal.zero();
      created.totalBalancePlusTotalClaimedBalance = BigDecimal.zero();
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
  vfOutcome.totalSupply = BigDecimal.zero();
  vfOutcome.totalWeightedSupply = BigDecimal.zero();
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

export function assertRoleEntity(roleHash: Bytes): Role {
  let id = roleHash.toHex();
  if (id == '0x0000000000000000000000000000000000000000000000000000000000000000') {
    id = 'DEFAULT_ADMIN_ROLE';
  } else if (id == '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929') {
    id = 'OPERATOR_ROLE';
  }
  const loaded = Role.load(id);
  if (loaded == null) {
    const created = new Role(id);
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

export function assertPaymentTokenEntity(token: Address): PaymentToken {
  const id = token.toHex();
  const loaded = PaymentToken.load(id);
  if (loaded == null) {
    const created = new PaymentToken(id);
    {
      created.address = token;
      const paymentTokenContract = IERC20Metadata.bind(token);
      const symbol = paymentTokenContract.symbol();
      created.name = paymentTokenContract.name();
      created.symbol = symbol;
      created.decimals = paymentTokenContract.decimals();
      created.isWhitelisted = false;
      created.isTest = symbol.startsWith('TEST');
    }
    created.save();
    return created;
  } else {
    {
      assertFieldEqual('PaymentToken', id, 'address', loaded.address, token);
    }
    return loaded;
  }
}
