import {
  fixtureFieldOrder,
  statusFieldOrder,
  type FixtureFields,
  type StatusFields,
} from '@zk-cricket/shared';
import { Field, PrivateKey, PublicKey, Signature } from 'o1js';

export function fixtureToFields(f: FixtureFields): Field[] {
  return fixtureFieldOrder(f).map((v) => Field(v));
}

export function statusToFields(s: StatusFields): Field[] {
  return statusFieldOrder(s).map((v) => Field(v));
}

export function signFixture(sk: PrivateKey, data: FixtureFields): Signature {
  return Signature.create(sk, fixtureToFields(data));
}

export function signStatus(sk: PrivateKey, data: StatusFields): Signature {
  return Signature.create(sk, statusToFields(data));
}

export function verifyFixture(
  pk: PublicKey,
  data: FixtureFields,
  sig: Signature
): boolean {
  return sig.verify(pk, fixtureToFields(data)).toBoolean();
}

export function verifyStatus(
  pk: PublicKey,
  data: StatusFields,
  sig: Signature
): boolean {
  return sig.verify(pk, statusToFields(data)).toBoolean();
}

export function fixtureCommitmentFields(
  f: FixtureFields,
  marketNonce: Field
): Field[] {
  return [...fixtureToFields(f), marketNonce];
}
