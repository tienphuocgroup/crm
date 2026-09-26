import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CompaniesModule } from "../companies/companies.module";
import { FieldsModule } from "../fields/fields.module";
import { MessagingModule } from "../messaging/messaging.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ContactsRouter } from "./contacts.router";
import { ContactsService } from "./contacts.service";

@Module({
	imports: [
		FieldsModule,
		TrpcModule,
		AgentModule,
		CompaniesModule,
		MessagingModule,
	],
	providers: [ContactsService, ContactsRouter],
	exports: [ContactsService],
})
export class ContactsModule {}
