/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  Address,
  BigDecimal,
  BigInt
} from '@graphprotocol/graph-ts';
import {
  TransferSingle as TransferSingleEvent,
  UserCommitment as UserCommitmentEvent,
  VirtualFloorCreation as VirtualFloorCreationEvent,
  VirtualFloorResolution as VirtualFloorResolutionEvent
} from '../generated/DoubleDice/DoubleDice';
import {
  Outcome,
  OutcomeTimeslot,
  OutcomeTimeslotTransfer,
  Timeslot,
  User,
  UserOutcome,
  UserOutcomeTimeslot,
  VirtualFloor,
  VirtualFloorTimeslot
} from '../generated/schema';

const toDecimal = (wei: BigInt): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(18)));

const usdcToDecimal = (wei: BigInt): BigDecimal => wei.divDecimal(new BigDecimal(BigInt.fromU32(10).pow(6)));

// Mirrors DoubleDice.sol#TIMESLOT_DURATION
const TIMESLOT_DURATION = 60;

interface Entity {
  save(): void
}

type LoadEntity<T> = (id: string) => T | null

function createNewEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity !== null) {
    throw new Error('createNewEntity: Was not expecting the entity to already exist');
  }
  entity = instantiate<T>(id);
  entity.save();
  return entity;
}

function loadExistentEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  const entity = load(id);
  if (entity === null) {
    throw new Error('loadExistentEntity: Was expecting entity to already exist');
  }
  return entity;
}

function loadOrCreateEntity<T extends Entity>(load: LoadEntity<T>, id: string): T {
  let entity = load(id);
  if (entity === null) {
    entity = instantiate<T>(id);
    entity.save();
  }
  return entity;
}

const calcBeta = (virtualFloor: VirtualFloor, timestamp: BigInt): BigDecimal => virtualFloor.betaGradient * (virtualFloor.tClose - timestamp).toBigDecimal();

export function handleVirtualFloorCreation(event: VirtualFloorCreationEvent): void {
  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = createNewEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    $.timestamp = event.block.timestamp;
    $.betaGradient = toDecimal(event.params.betaGradient);
    $.tClose = event.params.tClose;
    $.tResolve = event.params.tResolve;
    $.state = 'RUNNING_OR_CLOSED';
    $.save();
  }

  for (let outcomeIndex = 0; outcomeIndex < event.params.nOutcomes; outcomeIndex++) {
    const outcomeId = `${virtualFloorId}-${outcomeIndex}`;
    {
      const $ = createNewEntity<Outcome>(Outcome.load, outcomeId);
      $.virtualFloor = virtualFloorId;
      $.title = `Outcome № ${outcomeIndex}`;
      $.index = outcomeIndex;
      $.save();
    }
  }
}

export function handleUserCommitment(event: UserCommitmentEvent): void {
  const amount = usdcToDecimal(event.params.amount);
  const timeslotMinTimestamp = event.params.timeslot;

  let beta: BigDecimal;

  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);
    $.totalSupply += amount;
    $.save();

    beta = calcBeta($, timeslotMinTimestamp);
  }

  const outcomeId = `${virtualFloorId}-${event.params.outcomeIndex}`;
  {
    const $ = loadExistentEntity<Outcome>(Outcome.load, outcomeId);
    $.totalSupply += amount;
    $.totalWeightedSupply += beta * amount;
    $.save();
  }

  const timeslotId = timeslotMinTimestamp.toHex(); // ToDo: To 32 bytes
  {
    const $ = loadOrCreateEntity<Timeslot>(Timeslot.load, timeslotId);
    /* if (isNew) */ {
      $.minTimestamp = timeslotMinTimestamp;
      $.maxTimestamp = timeslotMinTimestamp + BigInt.fromU32(TIMESLOT_DURATION - 1);
      $.save();
    }
  }

  const virtualFloorTimeslotId = `${virtualFloorId}-${timeslotId}`;
  {
    const $ = loadOrCreateEntity<VirtualFloorTimeslot>(VirtualFloorTimeslot.load, virtualFloorTimeslotId);
    /* if (isNew) */ {
      $.virtualFloor = virtualFloorId;
      $.timeslot = timeslotId;
      $.save();
    }
  }

  const outcomeTimeslotId = event.params.tokenId.toHex(); // ToDo: To 32 bytes
  {
    const $ = loadOrCreateEntity<OutcomeTimeslot>(OutcomeTimeslot.load, outcomeTimeslotId);
    /* if (isNew) */ {
      $.outcome = outcomeId;
      $.timeslot = timeslotId;
    }
    $.totalSupply += amount;
    $.save();
  }

  // ToDo: Is this necessary?
  const nobodyId = Address.zero().toHex();
  {
    loadOrCreateEntity<User>(User.load, nobodyId);
  }

  const userId = event.transaction.from.toHex();
  {
    loadOrCreateEntity<User>(User.load, userId);
  }

  const userOutcomeId = `${outcomeId}-${userId}`;
  {
    const $ = loadOrCreateEntity<UserOutcome>(UserOutcome.load, userOutcomeId);
    /* if (isNew) */ {
      $.user = userId;
      $.outcome = outcomeId;
    }
    $.totalBalance += amount;
    $.totalWeightedBalance += beta * amount;
    $.save();
  }

  const userOutcomeTimeslotId = `${outcomeTimeslotId}-${userId}`;
  {
    const $ = loadOrCreateEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, userOutcomeTimeslotId);
    /* if (isNew) */ {
      $.user = userId;
      $.outcome = outcomeId;
      $.timeslot = timeslotId;
      $.outcomeTimeslot = outcomeTimeslotId;
    }
    $.balance += amount;
    $.save();
  }

  const postOfEventInTx = event.transactionLogIndex;
  const outcomeTimeslotTransferId = `${outcomeTimeslotId}-${event.transaction.hash.toHex()}-${postOfEventInTx}`;
  {
    const $ = createNewEntity<OutcomeTimeslotTransfer>(OutcomeTimeslotTransfer.load, outcomeTimeslotTransferId);
    $.outcomeTimeslot = outcomeTimeslotId;
    $.from = nobodyId;
    $.to = userId;
    $.timestamp = event.block.timestamp;
    // $.logIndex = event.logIndex.toI32();
    $.amount = amount;
    $.save();
  }
}

export function handleTransferSingle(event: TransferSingleEvent): void {
  if (event.params.from.equals(Address.zero()) || event.params.to.equals(Address.zero())) {
    return;
  }

  const amount = usdcToDecimal(event.params.value);

  let beta: BigDecimal;
  let outcomeId: string;
  const outcomeTimeslotId = event.params.id.toHex();
  {
    const outcomeTimeslot = loadExistentEntity<OutcomeTimeslot>(OutcomeTimeslot.load, outcomeTimeslotId);
    outcomeId = outcomeTimeslot.outcome;
    const outcome = loadExistentEntity<Outcome>(Outcome.load, outcomeId);
    const timeslot = loadExistentEntity<Timeslot>(Timeslot.load, outcomeTimeslot.timeslot);
    const virtualFloor = loadExistentEntity<VirtualFloor>(VirtualFloor.load, outcome.virtualFloor);
    beta = calcBeta(virtualFloor, timeslot.minTimestamp);
  }

  const fromUserId = event.params.from.toHex();
  {
    loadOrCreateEntity<User>(User.load, fromUserId);
  }

  const toUserId = event.params.to.toHex();
  {
    loadOrCreateEntity<User>(User.load, toUserId);
  }

  const toUserOutcomeTimeslotId = `${outcomeTimeslotId}-${toUserId}`;
  {
    const $ = loadExistentEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, toUserOutcomeTimeslotId);
    $.balance -= amount;
    $.save();
  }

  const fromUserOutcomeTimeslotId = `${outcomeTimeslotId}-${fromUserId}`;
  {
    const $ = loadExistentEntity<UserOutcomeTimeslot>(UserOutcomeTimeslot.load, fromUserOutcomeTimeslotId);
    $.balance += amount;
    $.save();
  }

  const postOfEventInTx = event.transactionLogIndex;
  const outcomeTimeslotTransferId = `${outcomeTimeslotId}-${event.transaction.hash.toHex()}-${postOfEventInTx}`;
  {
    const $ = createNewEntity<OutcomeTimeslotTransfer>(OutcomeTimeslotTransfer.load, outcomeTimeslotTransferId);
    $.outcomeTimeslot = outcomeTimeslotId;
    $.from = event.params.from.toHex();
    $.to = event.params.to.toHex();
    $.timestamp = event.block.timestamp;
    // $.logIndex = event.logIndex.toI32();
    $.amount = amount;
    $.save();
  }


  const fromUserOutcomeId = `${outcomeId}-${fromUserId}`;
  {
    const $ = loadExistentEntity<UserOutcome>(UserOutcome.load, fromUserOutcomeId);
    $.totalBalance -= amount;
    $.totalWeightedBalance -= beta * amount;
    $.save();
  }

  const toUserOutcomeId = `${outcomeId}-${toUserId}`;
  {
    const $ = loadExistentEntity<UserOutcome>(UserOutcome.load, toUserOutcomeId);
    $.totalBalance += amount;
    $.totalWeightedBalance += beta * amount;
    $.save();
  }
}


export function handleVirtualFloorResolution(event: VirtualFloorResolutionEvent): void {

  const virtualFloorId = event.params.virtualFloorId.toHex();
  {
    const $ = loadExistentEntity<VirtualFloor>(VirtualFloor.load, virtualFloorId);

    // Map DoubleDice.sol#VirtualFloorResolutionType => schema.graphql#VirtualFloorState
    switch (event.params.resolutionType) {
      case 0: // VirtualFloorResolutionType.NoWinners
        $.state = 'CANCELLED_BECAUSE_NO_WINNERS';
        break;
      case 1: // VirtualFloorResolutionType.SomeWinners
        $.state = 'COMPLETED';
        break;
      case 2: // VirtualFloorResolutionType.AllWinners
        $.state = 'CANCELLED_BECAUSE_ALL_WINNERS';
        break;
    }

    $.winningOutcome = event.params.outcomeIndex;

    $.save();
  }
}
