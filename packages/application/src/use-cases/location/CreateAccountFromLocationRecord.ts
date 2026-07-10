import {
  Account,
  AccountStatus,
  AccountType,
  asAccountId,
  asLocationRecordId,
  asOfficeLocationId,
  GeographicScope,
  LocationRecordKind,
} from "@pulse-brazil/domain";
import type { AccountSummaryDto } from "../../dto/account/AccountSummaryDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { ILocationRecordRepository } from "../../ports/ILocationRecordRepository.js";
import { toAccountSummaryDto } from "../account/GetAccountDetail.js";
import { officeLocationFromLocationRecord } from "./ImportLocationCsv.js";

function assertEnumMember<T extends Record<string, string>>(enumObject: T, value: string, fieldName: string): T[keyof T] {
  if (!Object.values(enumObject).includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${Object.values(enumObject).join(", ")}`);
  }
  return value as T[keyof T];
}

export interface CreateAccountFromLocationRecordCommand {
  locationRecordId: string;
  accountType?: string;
  status?: string;
}

/**
 * The reverse direction of ImportLocationCsv's write-through: turns an
 * already-existing, unlinked Office LocationRecord into a real Account,
 * seeded with that office as its primary location, and links the record
 * back to the new account. For the common case where a CSV of real offices
 * was imported before any account existed for them yet.
 */
export class CreateAccountFromLocationRecord {
  constructor(
    private readonly locationRecords: ILocationRecordRepository,
    private readonly accounts: IAccountRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: CreateAccountFromLocationRecordCommand): Promise<AccountSummaryDto> {
    const record = await this.locationRecords.findById(asLocationRecordId(command.locationRecordId));
    if (!record) {
      throw new NotFoundError("LocationRecord", command.locationRecordId);
    }
    if (record.linkedAccountId) {
      throw new ValidationError(`LocationRecord ${command.locationRecordId} is already linked to an account`);
    }
    if (record.kind !== LocationRecordKind.Office) {
      throw new ValidationError(`Only Office records can become an account directly (kind was ${record.kind})`);
    }
    if (!record.bestAvailableCoordinate) {
      throw new ValidationError(`LocationRecord ${command.locationRecordId} has no resolved coordinate`);
    }

    const accountType = assertEnumMember(AccountType, command.accountType ?? AccountType.Other, "accountType");
    const status = assertEnumMember(AccountStatus, command.status ?? AccountStatus.Prospect, "status");

    const accountId = asAccountId(this.idGenerator.newId());
    const office = officeLocationFromLocationRecord(record, asOfficeLocationId(this.idGenerator.newId()));

    const account = Account.create({
      id: accountId,
      name: record.label,
      accountType,
      status,
      geographicScope: GeographicScope.of({ countryCode: record.countryCode, city: record.rawAddress.city }),
      officeLocations: [office],
    });

    await this.accounts.save(account);
    await this.locationRecords.save(record.withLinkedAccount(accountId));

    return toAccountSummaryDto(account, null);
  }
}
