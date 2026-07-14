import { describe, expect, it, vi } from "vitest";
import {
  Account,
  AccountStatus,
  AccountType,
  asAccountId,
  ConnectorSource,
  GeographicScope,
  SignalOrigin,
  SignalType,
} from "@pulse-brazil/domain";
import type { IUnitOfWork, UnitOfWorkContext } from "../../ports/IUnitOfWork.js";
import { CreateSignal } from "./CreateSignal.js";

function account(id: string): Account {
  return Account.create({
    id: asAccountId(id),
    name: id,
    accountType: AccountType.Bank,
    status: AccountStatus.Active,
    geographicScope: GeographicScope.brazil(),
  });
}

describe("CreateSignal", () => {
  it("locks accounts in stable order and saves every change in one unit of work", async () => {
    const accounts = new Map([
      ["account-a", account("account-a")],
      ["account-b", account("account-b")],
    ]);
    const lockOrder: string[] = [];
    const saveSignal = vi.fn();
    const context: UnitOfWorkContext = {
      accounts: {
        findByIdForLink: async (id) => {
          lockOrder.push(id);
          return accounts.get(id) ?? null;
        },
      },
      signals: { save: saveSignal },
    };
    const executeSpy = vi.fn();
    const unitOfWork: IUnitOfWork = {
      async execute<T>(operation: (value: UnitOfWorkContext) => Promise<T>): Promise<T> {
        executeSpy();
        return operation(context);
      },
    };
    const useCase = new CreateSignal(unitOfWork, { newId: () => "signal-1" });

    await useCase.execute({
      source: ConnectorSource.ManualEntry,
      type: SignalType.AccountSpecific,
      title: "New mandate",
      summary: "Relevant account activity",
      linkedAccountIds: ["account-b", "account-a"],
      confidenceScore: 1,
      origin: SignalOrigin.HumanDerived,
    });

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(lockOrder).toEqual(["account-a", "account-b"]);
    expect(saveSignal).toHaveBeenCalledOnce();
    expect(saveSignal.mock.calls[0]?.[0].linkedAccountIds).toEqual(["account-b", "account-a"]);
  });
});
