/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable indent */
// Note: Despite the .ts file extension, this is AssemblyScript not TypeScript!

import {
  Address,
  BigDecimal,
  BigInt,
  ethereum,
  log
} from '@graphprotocol/graph-ts';
import {
  CreationQuotaAdjustments as CreationQuotaAdjustmentsEvent,
  PaymentTokenWhitelistUpdate as PaymentTokenWhitelistUpdateEvent,
  ResultUpdate as ResultUpdateEvent,
  TransferBatch as TransferBatchEvent,
  TransferSingle as TransferSingleEvent,
  UserCommitment as UserCommitmentEvent,
  VirtualFloorCancellationFlagged as VirtualFloorCancellationFlaggedEvent,
  VirtualFloorCancellationUnresolvable as VirtualFloorCancellationUnresolvableEvent,
  VirtualFloorCreation as VirtualFloorCreationEvent,
  VirtualFloorResolution as VirtualFloorResolutionEvent
} from '../../generated/DoubleDice/DoubleDice';
import {
  Outcome as VfOutcome,
  OutcomeTimeslot as VfOutcomeTimeslot,
  OutcomeTimeslotTransfer as VfOutcomeTimeslotTransfer,
  PaymentToken,
  User,
  VirtualFloor as Vf,
  VirtualFloorsAggregate
} from '../../generated/schema';
import {
  ResultUpdateAction,
  VirtualFloorResolutionType
} from '../../lib/helpers/sol-enums';
import { FIRST_NON_TEST_VF_BLOCK } from '../generated/env';
import {
  CHALLENGE_WINDOW_DURATION,
  SET_WINDOW_DURATION,
  SINGLETON_AGGREGATE_ENTITY_ID
} from './constants';
import {
  assertCategoryEntity,
  assertPaymentTokenEntity,
  assertSubcategoryEntity,
  assertUserEntity,
  assertVfOutcomeTimeslotEntity,
  assertVfOutcomeTimeslotUserEntity,
  assertVfOutcomeUserEntity,
  assertVfUserEntity,
  createNewEntity,
  createVfOpponentEntity,
  createVfOutcomeEntity,
  createVfResultSourceEntity,
  genVfEntityId,
  genVfOutcomeTimeslotEntityId,
  loadExistentEntity,
  loadExistentVfEntity,
  loadExistentVfOutcomeEntity
} from './entities';
import {
  decodeMetadata
} from './metadata';
import {
  resultUpdateActionOrdinalToSolEnum,
  resultUpdateActionSolEnumToGraphEnum
} from './result-update-action';
import {
  bigIntFixedPointToBigDecimal
} from './utils';

export * from './roles';

// Note: Bump up this nonce if we need to deploy the same build to multiple subgraphs,
// This will force a new build-id, thus averting potential issues on thegraph.com hosted service.
export const DUMMY_DEPLOYMENT_NONCE = 12;

const firstNonTestVfBlock = BigInt.fromString(FIRST_NON_TEST_VF_BLOCK);

// Manually mirrored from schema.graphql
const VirtualFloorState__Active_ResultChallenged = 'Active_ResultChallenged';
const VirtualFloorState__Active_ResultNone = 'Active_ResultNone';
const VirtualFloorState__Active_ResultSet = 'Active_ResultSet';
const VirtualFloorState__Claimable_Payouts = 'Claimable_Payouts';
const VirtualFloorState__Claimable_Refunds_Flagged = 'Claimable_Refunds_Flagged';
const VirtualFloorState__Claimable_Refunds_ResolvableNever = 'Claimable_Refunds_ResolvableNever';
const VirtualFloorState__Claimable_Refunds_ResolvedNoWinners = 'Claimable_Refunds_ResolvedNoWinners';

const MIN_POSSIBLE_COMMITMENT_AMOUNT = BigInt.fromString('1');
const MAX_POSSIBLE_COMMITMENT_AMOUNT = BigInt.fromString('115792089237316195423570985008687907853269984665640564039457584007913129639935');

/**
 * It doesn't matter whether this token is being enabled or disabled, we are only using it to discover
 * new ERC-20 payment tokens that might later be used in virtual-floors.
 */
export function handlePaymentTokenWhitelistUpdate(event: PaymentTokenWhitelistUpdateEvent): void {
  const paymentToken = assertPaymentTokenEntity(event.params.token);
  paymentToken.isWhitelisted = event.params.whitelisted;
  paymentToken.save();
}

// Temporary measure for categories already created on Beta deployment
function migrateMetadataCategory(old: string): string {
  if (old == 'polititcal') {
    return 'politics';
  } else if (old == 'crypto projects') {
    return 'crypto';
  } else if (old == 'others') {
    return 'other';
  } else {
    return old;
  }
}

export function handleVirtualFloorCreation(event: VirtualFloorCreationEvent): void {
  {
    let aggregate = VirtualFloorsAggregate.load(SINGLETON_AGGREGATE_ENTITY_ID);
    if (aggregate == null) {
      aggregate = new VirtualFloorsAggregate(SINGLETON_AGGREGATE_ENTITY_ID);
      aggregate.totalVirtualFloorsCreated = 0;
    }
    aggregate.totalVirtualFloorsCreated += 1;
    aggregate.save();
  }

  const metadata = decodeMetadata(event.params.metadata);

  const vfId = genVfEntityId(event.params.vfId);

  const vf = createNewEntity<Vf>(Vf.load, vfId);

  vf.isTest = metadata.subcategory == 'test' || event.block.number.lt(firstNonTestVfBlock);

  const category = assertCategoryEntity(migrateMetadataCategory(metadata.category));
  vf.category = category.id;

  const subcategory = assertSubcategoryEntity(category, metadata.subcategory);
  vf.subcategory = subcategory.id;

  vf.intId = event.params.vfId;
  vf.title = metadata.title;
  vf.description = metadata.description;
  vf.isListed = metadata.isListed;
  vf.discordChannelId = metadata.discordChannelId;

  const creator = assertUserEntity(event.params.creator);
  vf.creator = creator.id;
  vf.owner = creator.id; // Deprecated
  adjustUserConcurrentVirtualFloors(creator, +1);

  // Since the platform contract will reject VirtualFloors created with a PaymentToken that is not whitelisted,
  // we are sure that the PaymentToken entity referenced here will have always been created beforehand
  // when the token was originally whitelisted.
  const paymentToken = assertPaymentTokenEntity(event.params.paymentToken);
  assert(paymentToken.isWhitelisted);
  vf.paymentToken = paymentToken.id;

  vf.betaOpen = bigIntFixedPointToBigDecimal(event.params.betaOpen_e18, 18);
  vf.totalFeeRate = bigIntFixedPointToBigDecimal(event.params.totalFeeRate_e18, 18);
  vf.creationFeeRate = vf.totalFeeRate; // ToDo: Drop
  vf.protocolFeeRate = bigIntFixedPointToBigDecimal(event.params.protocolFeeRate_e18, 18);
  vf.platformFeeRate = vf.protocolFeeRate; // ToDo: Drop

  vf.creationTxHash = event.transaction.hash;
  vf.creationTxTimestamp = event.block.timestamp;
  vf.tCreated = vf.creationTxTimestamp; // ToDo: Drop

  vf.tOpen = event.params.tOpen;
  vf.tClose = event.params.tClose;
  vf.tResolve = event.params.tResolve;
  vf.tResultSetMin = event.params.tResolve;
  vf.tResultSetMax = event.params.tResolve.plus(SET_WINDOW_DURATION); // ToDo: Include this as event param tResultSetMax
  vf.state = VirtualFloorState__Active_ResultNone;

  const decimalBonusAmount = bigIntFixedPointToBigDecimal(event.params.bonusAmount, paymentToken.decimals);
  vf.bonusAmount = decimalBonusAmount;
  vf.totalSupply = decimalBonusAmount;

  // It turns out that BigDecimal cannot hold more than 34 significant digits, so it cannot represent MaxUint256 precisely.
  // As MaxUint256 is being used as a "special value" anyway, to signify "no maximum", we represent "no maximum" with `null` instead.
  const unsafeMinCommitmentAmount = bigIntFixedPointToBigDecimal(event.params.minCommitmentAmount, paymentToken.decimals);
  const unsafeMaxCommitmentAmount = bigIntFixedPointToBigDecimal(event.params.maxCommitmentAmount, paymentToken.decimals);
  vf.optionalMinCommitmentAmount = event.params.minCommitmentAmount.equals(MIN_POSSIBLE_COMMITMENT_AMOUNT) ? null : unsafeMinCommitmentAmount;
  vf.optionalMaxCommitmentAmount = event.params.maxCommitmentAmount.equals(MAX_POSSIBLE_COMMITMENT_AMOUNT) ? null : unsafeMaxCommitmentAmount;
  vf.minCommitmentAmount = unsafeMinCommitmentAmount; // ToDo: Drop
  vf.maxCommitmentAmount = unsafeMaxCommitmentAmount; // ToDo: Drop


  const allTextTokens: string[] = [
    metadata.title,
    metadata.description,
    metadata.category,
    metadata.subcategory,
  ];
  for (let i = 0; i < metadata.opponents.length; i++) {
    allTextTokens.push(metadata.opponents[i].title);
  }
  for (let i = 0; i < metadata.resultSources.length; i++) {
    allTextTokens.push(metadata.resultSources[i].title);
  }
  for (let i = 0; i < metadata.outcomes.length; i++) {
    allTextTokens.push(metadata.outcomes[i].title);
  }
  vf.allText = allTextTokens.join(' ');


  // VirtualFloor entity must be saved before calling createVfOpponentEntity, createVfResultSourceEntity, createVfOutcomeEntity
  vf.save();


  for (let i = 0; i < metadata.opponents.length; i++) {
    createVfOpponentEntity(vf, i, metadata.opponents[i].title, metadata.opponents[i].image);
  }

  for (let i = 0; i < metadata.resultSources.length; i++) {
    createVfResultSourceEntity(vf, i, metadata.resultSources[i].title, metadata.resultSources[i].url);
  }

  assert(metadata.outcomes.length == event.params.nOutcomes, `metadata.outcomes.length = ${metadata.outcomes.length} != event.params.nOutcomes = ${event.params.nOutcomes}`);
  for (let i = 0; i < metadata.outcomes.length; i++) {
    createVfOutcomeEntity(vf, i, metadata.outcomes[i].title);
  }
}

function convertPaymentTokenAmountToDecimal(vf: Vf, amount: BigInt): BigDecimal {
  const paymentToken = loadExistentEntity<PaymentToken>(PaymentToken.load, vf.paymentToken);
  return bigIntFixedPointToBigDecimal(amount, paymentToken.decimals);
}

export function handleUserCommitment(event: UserCommitmentEvent): void {
  const vfOutcome = loadExistentVfOutcomeEntity(event.params.vfId, event.params.outcomeIndex);

  const beta = bigIntFixedPointToBigDecimal(event.params.beta_e18, 18);
  assertVfOutcomeTimeslotEntity(vfOutcome, event.params.timeslot, event.params.tokenId, beta);

  const fromUser = Address.zero();

  // Note: We use an explicit `committer` param rather than relying on the underlying `event.transaction.from`
  // as if the transaction were being relayed by a 3rd party,
  // the commitment would be mistakenly attributed to the relayer.
  const toUser = event.params.committer;

  // Possibly this handler could simply instantiate the entities and exit at this point,
  // and then let the balances be updated in the handleTransferSingle executed
  // soon after during the same transaction.
  // But this would make the code depend on the ordering of events.
  // It might work, but it needs to be tested.
  // So instead, we update the balances right here,
  // and then during the handling of transfers, we skip mints.
  handleTransfers(event, fromUser, toUser, [event.params.tokenId], [event.params.amount]);
}

export function handleTransferSingle(event: TransferSingleEvent): void {
  // For mints, do not handle TransferSingle event itself, as this is already handled in handleUserCommitment
  if (event.params.from.equals(Address.zero())) {
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, [event.params.id], [event.params.value]);
}

export function handleTransferBatch(event: TransferBatchEvent): void {
  // For mints, do not handle TransferBatch event itself, as this is already handled in handleUserCommitment
  if (event.params.from.equals(Address.zero())) {
    return;
  }
  handleTransfers(event, event.params.from, event.params.to, event.params.ids, event.params.values);
}

function handleTransfers(event: ethereum.Event, fromAddr: Address, toAddr: Address, ids: BigInt[], values: BigInt[]): void {
  assert(ids.length == values.length);

  const isMint = fromAddr.equals(Address.zero());
  const isBurn = toAddr.equals(Address.zero());

  const fromUser = assertUserEntity(fromAddr);
  const toUser = assertUserEntity(toAddr);

  for (let i = 0; i < ids.length; i++) {
    const tokenId = ids[i];
    const value = values[i];

    const vfOutcomeTimeslot = loadExistentEntity<VfOutcomeTimeslot>(VfOutcomeTimeslot.load, genVfOutcomeTimeslotEntityId(tokenId));
    const vfOutcome = loadExistentEntity<VfOutcome>(VfOutcome.load, vfOutcomeTimeslot.outcome);
    const vf = loadExistentEntity<Vf>(Vf.load, vfOutcome.virtualFloor);

    const amount = convertPaymentTokenAmountToDecimal(vf, value);

    // We debit (credit -amount) the "from" hierarchy, and credit the "to" hierarchy.

    if (isMint) {
      // Do not debit the 0-address
    } else {
      const claimAmount = isBurn ? amount : BigDecimal.zero();
      creditEntityHierarchy(vfOutcomeTimeslot, fromUser, amount.neg(), claimAmount);
    }

    // Credit `to` even if it is address(0) and this is an ERC-1155 balance-burn,
    // as like that the totals will still remain under the VirtualFloor, Outcome, OutcomeTimeslot, etc.
    // They will be credited to address(0), so this address will eventually accumulate a lot of balance,
    // but it doesn't matter!
    // Doing it this way keeps things simple: the balance doesn't perish, it simply "changes ownership" to address(0)
    creditEntityHierarchy(vfOutcomeTimeslot, toUser, amount, BigDecimal.zero());

    const posOfEventInTx = event.transactionLogIndex;
    const outcomeTimeslotTransferEntityId = `${vfOutcomeTimeslot.id}-${event.transaction.hash.toHex()}-${posOfEventInTx}-${i}`;
    const vfOutcomeTimeslotTransfer = createNewEntity<VfOutcomeTimeslotTransfer>(VfOutcomeTimeslotTransfer.load, outcomeTimeslotTransferEntityId);
    vfOutcomeTimeslotTransfer.outcomeTimeslot = vfOutcomeTimeslot.id;
    vfOutcomeTimeslotTransfer.from = fromUser.id;
    vfOutcomeTimeslotTransfer.to = toUser.id;
    vfOutcomeTimeslotTransfer.txHash = event.transaction.hash;
    vfOutcomeTimeslotTransfer.txTimestamp = event.block.timestamp;
    vfOutcomeTimeslotTransfer.timestamp = vfOutcomeTimeslotTransfer.txTimestamp; // ToDo: Drop
    vfOutcomeTimeslotTransfer.amount = amount;
    vfOutcomeTimeslotTransfer.save();
  }
}

function creditEntityHierarchy(vfOutcomeTimeslot: VfOutcomeTimeslot, user: User, amount: BigDecimal, claimAmount: BigDecimal): void {
  const amountTimesBeta = amount.times(vfOutcomeTimeslot.beta);

  vfOutcomeTimeslot.totalSupply = vfOutcomeTimeslot.totalSupply.plus(amount);
  vfOutcomeTimeslot.save();

  const vfOutcome = loadExistentEntity<VfOutcome>(VfOutcome.load, vfOutcomeTimeslot.outcome);
  vfOutcome.totalSupply = vfOutcome.totalSupply.plus(amount);
  vfOutcome.totalWeightedSupply = vfOutcome.totalWeightedSupply.plus(amountTimesBeta);
  vfOutcome.save();

  const vf = loadExistentEntity<Vf>(Vf.load, vfOutcome.virtualFloor);
  vf.totalSupply = vf.totalSupply.plus(amount);
  vf.save();

  const vfUser = assertVfUserEntity(vf, user);
  vfUser.totalBalance = vfUser.totalBalance.plus(amount);
  vfUser.totalClaimedBalance = vfUser.totalClaimedBalance.plus(claimAmount);
  vfUser.totalBalancePlusTotalClaimedBalance = vfUser.totalBalance.plus(vfUser.totalClaimedBalance);
  vfUser.save();

  const vfOutcomeUser = assertVfOutcomeUserEntity(vfOutcome, user, vfUser);
  vfOutcomeUser.totalBalance = vfOutcomeUser.totalBalance.plus(amount);
  vfOutcomeUser.totalWeightedBalance = vfOutcomeUser.totalWeightedBalance.plus(amountTimesBeta);
  vfOutcomeUser.totalClaimedBalance = vfOutcomeUser.totalClaimedBalance.plus(claimAmount);
  vfOutcomeUser.totalBalancePlusTotalClaimedBalance = vfOutcomeUser.totalBalance.plus(vfOutcomeUser.totalClaimedBalance);
  vfOutcomeUser.save();

  const vfOutcomeTimeslotUser = assertVfOutcomeTimeslotUserEntity(vfOutcome, user, vfOutcomeTimeslot, vfOutcomeUser);
  vfOutcomeTimeslotUser.balance = vfOutcomeTimeslotUser.balance.plus(amount);
  vfOutcomeTimeslotUser.claimedBalance = vfOutcomeTimeslotUser.claimedBalance.plus(claimAmount);
  vfOutcomeTimeslotUser.balancePlusClaimedBalance = vfOutcomeTimeslotUser.balance.plus(vfOutcomeTimeslotUser.claimedBalance);
  vfOutcomeTimeslotUser.save();
}

export function handleVirtualFloorCancellationUnresolvable(event: VirtualFloorCancellationUnresolvableEvent): void {
  const vf = loadExistentVfEntity(event.params.vfId);
  const creator = loadExistentEntity<User>(User.load, vf.creator);
  adjustUserConcurrentVirtualFloors(creator, -1);
  vf.state = VirtualFloorState__Claimable_Refunds_ResolvableNever;
  vf.resolutionOrCancellationTxHash = event.transaction.hash;
  vf.resolutionOrCancellationTxTimestamp = event.block.timestamp;
  vf.save();
}

export function handleVirtualFloorCancellationFlagged(event: VirtualFloorCancellationFlaggedEvent): void {
  const vf = loadExistentVfEntity(event.params.vfId);
  const creator = loadExistentEntity<User>(User.load, vf.creator);
  adjustUserConcurrentVirtualFloors(creator, -1);
  vf.state = VirtualFloorState__Claimable_Refunds_Flagged;
  vf.resolutionOrCancellationTxHash = event.transaction.hash;
  vf.resolutionOrCancellationTxTimestamp = event.block.timestamp;
  vf.flaggingReason = event.params.reason;
  vf.save();
}

export function handleVirtualFloorResolution(event: VirtualFloorResolutionEvent): void {
  const vf = loadExistentVfEntity(event.params.vfId);
  const creator = loadExistentEntity<User>(User.load, vf.creator);
  adjustUserConcurrentVirtualFloors(creator, -1);
  switch (event.params.resolutionType) {
    case VirtualFloorResolutionType.NoWinners:
      vf.state = VirtualFloorState__Claimable_Refunds_ResolvedNoWinners;
      break;
    case VirtualFloorResolutionType.Winners:
      vf.state = VirtualFloorState__Claimable_Payouts;
      break;
  }
  vf.resolutionOrCancellationTxHash = event.transaction.hash;
  vf.resolutionOrCancellationTxTimestamp = event.block.timestamp;
  vf.winningOutcome = loadExistentVfOutcomeEntity(event.params.vfId, event.params.winningOutcomeIndex).id;
  vf.winnerProfits = convertPaymentTokenAmountToDecimal(vf, event.params.winnerProfits);
  vf.save();
}

export function handleCreationQuotaAdjustments(event: CreationQuotaAdjustmentsEvent): void {
  const adjustments = event.params.adjustments;
  for (let i = 0; i < adjustments.length; i++) {
    const creator = assertUserEntity(adjustments[i].creator);
    creator.maxConcurrentVirtualFloors = creator.maxConcurrentVirtualFloors.plus(adjustments[i].relativeAmount);
    creator.save();
  }
}

function adjustUserConcurrentVirtualFloors(user: User, adjustment: i32): void {
  user.concurrentVirtualFloors = user.concurrentVirtualFloors.plus(BigInt.fromI32(adjustment));
  user.save();
}

export function handleResultUpdate(event: ResultUpdateEvent): void {
  const vf = loadExistentVfEntity(event.params.vfId);

  // ToDo: Overwrite this every time result is updated,
  // or write only final-result in it?
  // By overwriting every time, it is not possible to query Graph for history of what happened,
  // but only for latest result.
  vf.winningOutcome = loadExistentVfOutcomeEntity(event.params.vfId, event.params.outcomeIndex).id;

  const action = resultUpdateActionOrdinalToSolEnum(event.params.action);

  switch (action) {
    case ResultUpdateAction.CreatorSetResult:
      vf.state = VirtualFloorState__Active_ResultSet;
      vf.tResultChallengeMax = event.block.timestamp.plus(CHALLENGE_WINDOW_DURATION); // ToDo: Include this as event param tChallengeMax
      break;
    case ResultUpdateAction.SomeoneChallengedSetResult: {
      vf.state = VirtualFloorState__Active_ResultChallenged;
      vf.challenger = assertUserEntity(event.params.operator).id;
      break;
    }
    case ResultUpdateAction.OperatorFinalizedUnsetResult:
    case ResultUpdateAction.SomeoneConfirmedUnchallengedResult:
    case ResultUpdateAction.OperatorFinalizedChallenge:
      // No need to handle these, as these will all result in a separate `VirtualFloorResolution` event,
      // which will be handled by `handleVirtualFloorResultion`
      break;
  }

  vf.resultUpdateAction = resultUpdateActionSolEnumToGraphEnum(action);

  vf.save();
}
