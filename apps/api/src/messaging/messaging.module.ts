import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { MessagingRouter } from "./messaging.router";
import { MessagingService } from "./messaging.service";
import { isZaloHalfConfigured } from "./messaging-config";
import { MessagingWriterService } from "./messaging-writer.service";
import { ZaloRouter } from "./zalo/zalo.router";
import { ZaloConnectionService } from "./zalo/zalo-connection.service";
import { ZaloOauthController } from "./zalo/zalo-oauth.controller";
import { ZaloOauthService } from "./zalo/zalo-oauth.service";
import { ZaloWebhookController } from "./zalo/zalo-webhook.controller";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [ZaloOauthController, ZaloWebhookController],
	providers: [
		MessagingService,
		MessagingWriterService,
		MessagingRouter,
		ZaloConnectionService,
		ZaloOauthService,
		ZaloRouter,
	],
	exports: [ZaloConnectionService, MessagingWriterService],
})
export class MessagingModule implements OnModuleInit {
	private readonly logger = new Logger(MessagingModule.name);

	onModuleInit(): void {
		if (!isZaloHalfConfigured()) return;

		this.logger.warn({
			message:
				"ZALO_APP_ID and ZALO_APP_SECRET must be set together. Zalo stays off.",
		});
	}
}
