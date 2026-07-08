import {
  Account,
  AccountStatus,
  AccountType,
  asAccountId,
  ExternalReference,
  ExternalSystem,
  GeographicScope,
} from "@pulse-brazil/domain";
import type { AccountSummaryDto } from "../../dto/account/AccountSummaryDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import { toAccountSummaryDto } from "./GetAccountDetail.js";

export interface CreateAccountExternalReferenceInput {
  system: string;
  externalId: string;
  url?: string;
}

export interface CreateAccountCommand {
  name: string;
  accountType: string;
  status?: string;
  geographicScope: { countryCode: string; region?: string; city?: string };
  externalReferences?: CreateAccountExternalReferenceInput[];
}

function assertEnumMember<T extends Record<string, string>>(
  enumObject: T,
  value: string,
  fieldName: string,
): T[keyof T] {
  if (!Object.values(enumObject).includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${Object.values(enumObject).join(", ")}`);
  }
  return value as T[keyof T];
}

/** Registers a new Brazilian capital-markets account. Salesforce (or any other system) is passed in as an ExternalReference, never as the account's identity. */
export class CreateAccount {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: CreateAccountCommand): Promise<AccountSummaryDto> {
    if (!command.name.trim()) {
      throw new ValidationError("name is required");
    }
    const accountType = assertEnumMember(AccountType, command.accountType, "accountType");
    const status = command.status ? assertEnumMember(AccountStatus, command.status, "status") : AccountStatus.Prospect;

    const geographicScope = GeographicScope.of(command.geographicScope);

    const externalReferences = (command.externalReferences ?? []).map((reference) =>
      ExternalReference.of({
        system: assertEnumMember(ExternalSystem, reference.system, "externalReferences[].system"),
        externalId: reference.externalId,
        url: reference.url,
      }),
    );

    const account = Account.create({
      id: asAccountId(this.idGenerator.newId()),
      name: command.name,
      accountType,
      status,
      geographicScope,
      externalReferences,
    });

    await this.accounts.save(account);
    return toAccountSummaryDto(account, null);
  }
}
