import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {
  	const token = process.env.BOT_TOKEN;

  	this.appService.startBot(token);
	}
	@Get()
	testMessage(): string {
		return 'Everything works!';
	}
}
