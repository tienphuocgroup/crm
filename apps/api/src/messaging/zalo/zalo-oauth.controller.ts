import type { auth } from "@crm/auth";
import { BadRequestException, Controller, Get, Req, Res } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { zaloCallbackQuery, zaloConnectQuery } from "./zalo-oauth.schema";
import { ZaloOauthService } from "./zalo-oauth.service";

type CrmSession = UserSession<typeof auth>;

@Controller("api/messaging/zalo")
export class ZaloOauthController {
	constructor(private readonly oauth: ZaloOauthService) {}

	@Get("connect")
	async connect(
		@Session() session: CrmSession,
		@Req() request: Request,
		@Res() response: Response,
	): Promise<void> {
		const query = zaloConnectQuery.safeParse(request.query);
		if (!query.success) {
			throw new BadRequestException(
				"This connect link carries a return path this CRM cannot use.",
			);
		}

		const { authorizeUrl } = await this.oauth.start({
			userId: session.user.id,
			returnTo: query.data.returnTo,
		});

		response.redirect(authorizeUrl);
	}

	@Get("callback")
	async callback(
		@Session() session: CrmSession,
		@Req() request: Request,
		@Res() response: Response,
	): Promise<void> {
		const query = zaloCallbackQuery.safeParse(request.query);
		if (!query.success) {
			response.redirect(this.oauth.errorTarget("state"));
			return;
		}

		const target = await this.oauth.complete({
			userId: session.user.id,
			code: query.data.code,
			state: query.data.state,
		});

		response.redirect(target);
	}
}
