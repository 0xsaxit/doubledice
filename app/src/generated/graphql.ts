export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  BigDecimal: string;
  BigInt: string;
};

export type Outcome = {
  __typename?: 'Outcome';
  id: Scalars['ID'];
  index: Scalars['Int'];
  outcomeTimeslots: Array<OutcomeTimeslot>;
  title: Scalars['String'];
  totalSupply: Scalars['BigDecimal'];
  totalWeightedSupply: Scalars['BigDecimal'];
  userOutcomeTimeslots: Array<UserOutcomeTimeslot>;
  userOutcomes: Array<UserOutcome>;
  virtualFloor: VirtualFloor;
};

export type OutcomeTimeslot = {
  __typename?: 'OutcomeTimeslot';
  id: Scalars['ID'];
  outcome: Outcome;
  outcomeTimeslotTransfers: Array<OutcomeTimeslotTransfer>;
  timeslot: Timeslot;
  totalSupply: Scalars['BigDecimal'];
  userOutcomeTimeslots: Array<UserOutcomeTimeslot>;
};

export type OutcomeTimeslotTransfer = {
  __typename?: 'OutcomeTimeslotTransfer';
  amount: Scalars['BigDecimal'];
  from: User;
  id: Scalars['ID'];
  outcomeTimeslot: OutcomeTimeslot;
  timestamp: Scalars['BigInt'];
  to: User;
};

export type Timeslot = {
  __typename?: 'Timeslot';
  id: Scalars['ID'];
  maxTimestamp: Scalars['BigInt'];
  minTimestamp: Scalars['BigInt'];
  outcomeTimeslots: Array<OutcomeTimeslot>;
  userOutcomeTimeslots: Array<UserOutcomeTimeslot>;
  virtualFloorTimeslots: Array<VirtualFloorTimeslot>;
};

export type User = {
  __typename?: 'User';
  id: Scalars['ID'];
  outcomeTimeslotTransfersFrom: Array<OutcomeTimeslotTransfer>;
  outcomeTimeslotTransfersTo: Array<OutcomeTimeslotTransfer>;
  userOutcomeTimeslots: Array<UserOutcomeTimeslot>;
  userOutcomes: Array<UserOutcome>;
};

export type UserOutcome = {
  __typename?: 'UserOutcome';
  id: Scalars['ID'];
  outcome: Outcome;
  totalBalance: Scalars['BigDecimal'];
  totalWeightedBalance: Scalars['BigDecimal'];
  user: User;
};

export type UserOutcomeTimeslot = {
  __typename?: 'UserOutcomeTimeslot';
  balance: Scalars['BigDecimal'];
  id: Scalars['ID'];
  outcome: Outcome;
  outcomeTimeslot: OutcomeTimeslot;
  timeslot: Timeslot;
  user: User;
};

export type VirtualFloor = {
  __typename?: 'VirtualFloor';
  betaGradient: Scalars['BigDecimal'];
  id: Scalars['ID'];
  outcomes: Array<Outcome>;
  state: VirtualFloorState;
  tClose: Scalars['BigInt'];
  tResolve: Scalars['BigInt'];
  timestamp: Scalars['BigInt'];
  totalSupply: Scalars['BigDecimal'];
  virtualFloorTimeslots: Array<VirtualFloorTimeslot>;
  winningOutcome: Scalars['Int'];
};

export enum VirtualFloorState {
  CancelledBecauseAllWinners = 'CANCELLED_BECAUSE_ALL_WINNERS',
  CancelledBecauseNoWinners = 'CANCELLED_BECAUSE_NO_WINNERS',
  Completed = 'COMPLETED',
  RunningOrClosed = 'RUNNING_OR_CLOSED'
}

export type VirtualFloorTimeslot = {
  __typename?: 'VirtualFloorTimeslot';
  id: Scalars['ID'];
  timeslot: Timeslot;
  virtualFloor: VirtualFloor;
};
