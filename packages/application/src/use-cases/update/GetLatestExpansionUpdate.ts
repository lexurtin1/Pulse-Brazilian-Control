import type { ExpansionUpdateDto } from "../../dto/update/ExpansionUpdateDto.js";
import type { IExpansionUpdateRepository } from "../../ports/IExpansionUpdateRepository.js";
import { toExpansionUpdateDto } from "./ExpansionUpdateMapper.js";

/** Returns `null` before anything has ever been ingested — same empty-state convention as GetPipelineSummary. */
export class GetLatestExpansionUpdate {
  constructor(private readonly updates: IExpansionUpdateRepository) {}

  async execute(): Promise<ExpansionUpdateDto | null> {
    const current = await this.updates.findCurrent();
    return current ? toExpansionUpdateDto(current) : null;
  }
}
