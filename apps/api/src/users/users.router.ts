import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { setLocaleInput } from "./users.contracts";
import { UsersService } from "./users.service";

@Router({ alias: "users" })
@UseMiddlewares(AuthMiddleware)
export class UsersRouter {
	constructor(
		@Inject(UsersService) private readonly users: UsersService,
		@Inject(AuthService) private readonly auth: AuthService,
	) {}

	@Query()
	async me(@Ctx() ctx: AuthedTrpcContext) {
		return this.auth.getProfile(ctx.user.id);
	}

	@Query()
	async list() {
		return this.users.list();
	}

	@Mutation({ input: setLocaleInput })
	async setLocale(
		@Input() input: z.infer<typeof setLocaleInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.users.setLocale(ctx.user.id, input.locale);
	}
}
