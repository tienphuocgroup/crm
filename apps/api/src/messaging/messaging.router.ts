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
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	messagingLinkContactInput,
	messagingMessagesInput,
	messagingSendInput,
	messagingThreadByContactInput,
	messagingThreadIdInput,
	messagingThreadsInput,
} from "./messaging.contracts";
import { MessagingService } from "./messaging.service";

@Router({ alias: "messaging" })
@UseMiddlewares(AuthMiddleware)
export class MessagingRouter {
	constructor(
		@Inject(MessagingService) private readonly messaging: MessagingService,
	) {}

	@Query({ input: messagingThreadsInput })
	async threads(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadsInput>,
	) {
		return this.messaging.threads(ctx.user.id, input);
	}

	@Query({ input: messagingThreadByContactInput })
	async threadByContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadByContactInput>,
	) {
		return this.messaging.threadByContact(ctx.user.id, input.contactId);
	}

	@Query({ input: messagingThreadIdInput })
	async threadById(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadIdInput>,
	) {
		return this.messaging.threadById(ctx.user.id, input.threadId);
	}

	@Query()
	async unreadCount(@Ctx() ctx: AuthedTrpcContext) {
		return this.messaging.unreadCount(ctx.user.id);
	}

	@Query({ input: messagingMessagesInput })
	async messages(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingMessagesInput>,
	) {
		return this.messaging.messages(ctx.user.id, input);
	}

	@Query({ input: messagingThreadIdInput })
	async eligibility(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadIdInput>,
	) {
		return this.messaging.eligibilityFor(ctx.user.id, input.threadId);
	}

	@Mutation({ input: messagingSendInput })
	async send(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingSendInput>,
	) {
		return this.messaging.send(ctx.user.id, input);
	}

	@Mutation({ input: messagingLinkContactInput })
	async linkContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingLinkContactInput>,
	) {
		return this.messaging.linkContact(
			ctx.user.id,
			input.threadId,
			input.contactId,
		);
	}

	@Mutation({ input: messagingThreadIdInput })
	async unlinkContact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadIdInput>,
	) {
		return this.messaging.unlinkContact(ctx.user.id, input.threadId);
	}

	@Mutation({ input: messagingThreadIdInput })
	async deleteThread(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadIdInput>,
	) {
		return this.messaging.deleteThread(ctx.user.id, input.threadId);
	}

	@Mutation({ input: messagingThreadIdInput })
	async markRead(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof messagingThreadIdInput>,
	) {
		return this.messaging.markRead(ctx.user.id, input.threadId);
	}
}
