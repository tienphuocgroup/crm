import { Inject } from "@nestjs/common";
import { Ctx, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { AuthedTrpcContext } from "../../trpc/context.types";
import { AuthMiddleware } from "../../trpc/middlewares/auth.middleware";
import { ZaloConnectionService } from "./zalo-connection.service";

@Router({ alias: "zalo" })
@UseMiddlewares(AuthMiddleware)
export class ZaloRouter {
	constructor(
		@Inject(ZaloConnectionService)
		private readonly connection: ZaloConnectionService,
	) {}

	@Query()
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.status(ctx.user.id);
	}

	@Mutation()
	disconnect(@Ctx() ctx: AuthedTrpcContext) {
		return this.connection.disconnect(ctx.user.id);
	}
}
