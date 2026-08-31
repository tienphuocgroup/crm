import { Inject } from "@nestjs/common";
import { Ctx, Input, Mutation, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { importCommitInput } from "./imports.contracts";
import { ImportsService } from "./imports.service";

@Router({ alias: "imports" })
@UseMiddlewares(AuthMiddleware)
export class ImportsRouter {
	constructor(
		@Inject(ImportsService) private readonly imports: ImportsService,
	) {}

	@Mutation({ input: importCommitInput })
	async commit(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof importCommitInput>,
	) {
		return this.imports.commit(ctx.user.id, input);
	}
}
