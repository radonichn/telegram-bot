import { Injectable } from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import * as request from 'request';
import * as cheerio from 'cheerio';
import { DateTime } from 'luxon';
import config from '@/config';
import { DATE_FORMAT, SITE_DATE_FORMAT } from '@/constants';

@Injectable()
export class AppService {
  startBot(token: string) {
  	if (token) {
			const bot = new Telegraf(token);

			const localDate = DateTime.local().toFormat('dd.MM.yyyy');

			const infoMessage = `*Для того, чтобы просмотреть Богослужебные указания, пожалуйста введите дату*\n\n_Формат даты для ввода -_ *ДД.ММ.ГГГГ*\n\nПример: ${localDate}`;

			bot.command('start', ({ replyWithMarkdown }) => {
				replyWithMarkdown(`*Добро пожаловать!*\n\n${infoMessage}`).catch(this.errorHandler)
			});

			bot.on('message', ({ replyWithMarkdown, message }) => {
				this.parsePage(message.text, config.fullMessageDefault).then(({ text, buttons }) => {
					replyWithMarkdown(text, buttons).catch(this.errorHandler);
				}).catch(() => {
					replyWithMarkdown(infoMessage).catch(this.errorHandler);
				});
			});

			bot.on('callback_query', ({ update, answerCbQuery, editMessageText, replyWithMarkdown }) => {
				const [mode, urlDate] = update.callback_query.data.split('_');

				const full = mode === 'full';

				this.parsePage(urlDate, full).then(({ text, buttons }) => {
					editMessageText(text, buttons).catch(this.errorHandler);
				}).catch(() => {
					replyWithMarkdown(infoMessage).catch(this.errorHandler);
				}).finally(() => {
					answerCbQuery('', false).catch(this.errorHandler);
				});
			});

			bot.startPolling();
		}
  }
  errorHandler(err: any): void {
  	console.log(err?.description || 'error');
	}
  parsePage(date: DateTime, full = false): Promise<any> {
    return new Promise(((resolve, reject) => {
      if (!DateTime.fromFormat(date, DATE_FORMAT).isValid) {
        reject();
      }

      const urlDate = DateTime.fromFormat(date, DATE_FORMAT).toFormat(SITE_DATE_FORMAT);

      const requestURL = `${config.url}/${urlDate}`;

      request(requestURL, function(err, res, body) {
        if (err && res.statusCode !== 200) {
          reject();
        } else {
          const $ = cheerio.load(body, {
            normalizeWhitespace: true,
          });

          const formattedDate = DateTime.fromFormat(urlDate, SITE_DATE_FORMAT).toFormat(DATE_FORMAT);

          const items = [];

          items.push(`*Богослужебные указания ${formattedDate}*`)

          const title = `*${$('.main .section > p').first().text().replace(/\u0301/g, '').trim()}*`;

          items.push(title);

          $('blockquote').each((i, elem) => {
            const item: { title?: string, content?: string } = {};

            $(elem).children().each((i, elem) => {
              const text = $(elem).text();

              if ($(elem).is('b')) {
                item.title = `*${text}*`
              } else if ($(elem).hasClass('chten')) {
								const content = [];

              	$('span.chten > div > div').each((index, chtenElem) => {
              		const parentText = $(chtenElem).clone().children().remove().end().text().trim();

              		if (parentText) {
              			content.push(`${parentText} `);
									}

									$(chtenElem).children().each((itemIndex, item) => {
										if ($(item).is('a')) {
											const text = $(item).text().trim();

											content.push(`[${text}](${$(item).attr('href')})`);
										}
									});

									content.push('\n');
								});

								item.content = content.filter(v => !!v).slice(0, -1).join('');
							} else {
                item.content = `_${text}_`;
              }
            });

            items.push(`${item.title} \n${item.content}`);
          });

          if (full) {
            $('.main .section > p:not(:first-of-type)').each((i, elem) => {
              const text = $(elem).text().trim();

              const sum = `${text}\n\n`.length + items.join('\n\n').length;

              if (sum < 4000) {
                items.push(text);
              }
            });
          }

          const text = items.join('\n\n');

          const buttons = Markup.inlineKeyboard(
          	[
          		Markup.callbackButton('Короткие указания', `short_${date}`),
          		Markup.callbackButton('Полные указания', `full_${date}`),
							Markup.urlButton(`Богослужебные указания ${formattedDate}`, requestURL),
						], { columns: 2 }).extra({ parse_mode: 'Markdown', disable_web_page_preview: true });

          resolve({ text, buttons });
        }
      });
    }));
  }
}

