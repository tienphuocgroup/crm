import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ImportsRouter } from "./imports.router";
import { ImportsService } from "./imports.service";

@Module({
	imports: [TrpcModule],
	providers: [ImportsService, ImportsRouter],
})
export class ImportsModule {}
