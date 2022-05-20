/**
	* @name FreeStickers
	* @displayName FreeStickers
	* @author Zs
	* @authorId 310450863845933057
	* @version 1.0.0
	* @description Enables you to send custom stricks without nitro as links, (custom stickers as in the ones that are added by servers, not officiel discord stickers).
	* @authorLink https://github.com/Debuggerz1
	* @source https://github.com/Debuggerz1/BetterDiscordPlugins/tree/main/FreeStickers
*/


const config = {
	info: {
		"name": "FreeStickers",
		"authors": [{
			"name": "Zs",
			"github_username": "Debuggerz1", 
			"discord_id": "750099582779916469"
		}],
		"version": "1.0.0",
		"description": "Enables you to send custom stricks without nitro as links, (custom stickers as in the ones that are added by servers, not officiel discord stickers).",
		"github": "https://github.com/Debuggerz1/BetterDiscordPlugins/tree/main/FreeStickers",
		"github_raw": "https://raw.githubusercontent.com/Debuggerz1/BetterDiscordPlugins/main/FreeStickers/FreeStickers.plugin.js"
	},
	defaultConfig: [{
		type: 'slider',
		id: 'stickerSize',
		name: 'Sticker Size',
		note: 'The size of the sticker in pixels. 160 is recommended.',
		value: 160,
		markers: [20, 40, 80, 160, 320],
		stickToMarkers: true
	}, {
		type: 'switch',
		id: 'keepStickersPopoutOpen',
		name: 'Holding shift keeps stickers menu open',
		note: 'This functionally has a great chancing of breaking due to other plugins overriding it.',
		value: true
	}, {
		type: "category",
		id: "preview",
		name: "Preview Settings",
		collapsible: true,
		shown: false,
		settings: [{
			type: 'switch',
			id: 'stickerPreview',
			name: 'Enable Preview for stickers',
			note: 'Enables a preview for stickers, Sometimes stickers tend to be small or has text that is unreadable',
			value: true
		}, {
			type: 'switch',
			id: 'emojiPreview',
			name: 'Enables Preview for emojis',
			note: 'Enables a preview for emojis, Emojis tend to be small or has text that is unreadable',
			value: true
		}, {
			type: 'slider',
			id: 'previewSize',
			name: 'Previw Size',
			note: 'The size of the preview',
			value: 300,
			markers: [100, 200, 300, 400, 500, 600],
			stickToMarkers: true
		}]
	}]
};


module.exports = (() => {
	return !global.ZeresPluginLibrary ? class {
			constructor() { this._config = config; }
			load() {
				BdApi.showConfirmationModal('Library plugin is needed',
					[`**ZeresPluginLibrary** is needed to run **${config.info.name}**.`, `Please download it from the officiel website`, 'https://betterdiscord.app/plugin/ZeresPluginLibrary'], {
						confirmText: 'Ok'
					});
			}
			start() {}
			stop() {}
		} :
		(([Plugin, Api]) => {
			const {
				Patcher,
				WebpackModules,
				PluginUtilities,
				DiscordModules: {
					React,
					React: { useState },
					UserStore,
					ChannelStore,
					SelectedChannelStore
				}
			} = Api;

			const StickerType = WebpackModules.getByProps(['MetaStickerType'])
			const StickersFunctions = WebpackModules.getByProps(['getStickerById']);
			const StickersSendability = WebpackModules.getByProps(['isSendableSticker']);
			const MessageUtilities = WebpackModules.getByProps("sendStickers");
			const closeExpressionPicker = WebpackModules.getByProps("closeExpressionPicker");
			const ReactionPopout = WebpackModules.getByProps("isSelected");
			const StickerMeta = WebpackModules.getByProps('addStickerPreview')
			const ExpressionPickerInspector = WebpackModules.find(e => e.default.displayName === "ExpressionPickerInspector");
			const StickerPickerLoader = WebpackModules.find(m => m.default.displayName === 'StickerPickerLoader');
			const Sticker = WebpackModules.find(m => m.default.displayName === 'Sticker');
			const Popout = WebpackModules.getByDisplayName("Popout");

			const ExpressionPickerListItemImage = WebpackModules.find(m => m.default.displayName === 'ExpressionPickerListItemImage');
			const css = `
				.stickersPreview {
					width:400px;
					font-size: 14px;
					background: var(--background-floating);
					border-radius: 5px;
					padding: .5em;
					box-shadow: var(--elevation-high);
				}
				.stickersPreview img{
					min-width:100%;
					max-width:100%;
				}`;


			const previewComponent = ({ sticker, element, data, previewSize }) => {
				const [showPopout, setShowPopout] = useState(false);

				return React.createElement(Popout, {
					shouldShow: showPopout,
					position: Popout.Positions.TOP,
					align: Popout.Align.CENTER,
					animation: Popout.Animation["SCALE"],
					spacing: 0,
					renderPopout: () => {
						return React.createElement("div", {
							style: { width: `${previewSize}px` },
							className: "stickersPreview"
						}, React.createElement('img', {
							src: sticker ?
								`https://media.discordapp.net/stickers/${data.id}.webp?size=640&quality=lossless` : `${data.src.split('?')[0]}?size=640&passthrough=false&quality=lossless`
						}))
					}
				}, (e) => {
					return React.createElement('div', {
						onMouseEnter: () => { setShowPopout(true) },
						onMouseLeave: () => { setShowPopout(false) }
					}, element)
				})
			}
			return class FreeStickers extends Plugin {
				constructor() {
					super();
					// saving this because it's needed to check if sticker is able to be sent normally
					// and because it's patched
					this.stickerSendability = StickersSendability.getStickerSendability;
					// a boolean for whether to close ExpressionPicker
					this.canClosePicker = true;
					// keydown/keyup listeners checking for shift key
					this.listeners = [
						(e) => this.canClosePicker = !(e.keyCode === 16),
						(e) => this.canClosePicker = true
					]
				}

				patchSticker() {
					// Add a zoom/preview popout to stickers
					Patcher.after(Sticker, 'default', (_, args, ret) => {
						// TODO: if sticker size is 160 means sticker is in chat and not in Picker
						const sticker = args[0].sticker;
						return (this.settings.preview.stickerPreview && sticker.type === StickerType.MetaStickerType.GUILD) ?
							React.createElement(previewComponent, {
								previewSize: this.settings.preview.previewSize,
								sticker: true,
								element: ret,
								data: sticker
							}) : ret;
					})
					// Add a zoom/preview popout to Emojis 
					Patcher.after(ExpressionPickerListItemImage, 'default', (_, args, ret) => {
						return this.settings.preview.emojiPreview ?
							React.createElement(previewComponent, {
								previewSize: this.settings.preview.previewSize,
								element: ret,
								data: args[0]
							}) : ret;

					})
				}
				patchStickerAttachement() {
					Patcher.before(MessageUtilities, 'sendMessage', (_, args, ret) => {
						const [channelId, , , attachments] = args;
						if (attachments && attachments.stickerIds && attachments.stickerIds.filter) {
							const [stickerId] = attachments.stickerIds;
							const { SENDABLE } = StickersSendability.StickerSendability;
							if (this.isStickerSendable(stickerId) !== SENDABLE) {
								args[3] = {};
								this.sendStickerAsLink(stickerId, channelId);
							}
						}
					})
				}

				patchStickerPickerLoader() {
					// Bypass send external stickers permission by adding current user as exception to the channel
					// Weirdly enough 'Use External Stickers' permission doesn't do anything
					// 'Use External Emoji' is needed
					Patcher.before(StickerPickerLoader, 'default', (_, args, ret) => {
						const temp = {};
						temp[UserStore.getCurrentUser().id] = {
							id: UserStore.getCurrentUser().id,
							type: 1,
							allow: 262144n,
							deny: 0n
						};
						args[0].channel.permissionOverwrites = {
							...args[0].channel.permissionOverwrites,
							...temp
						};
					})
				}
				patchStickerClickability() {
					// if it's a guild sticker return true to make it clickable 
					// ignoreing discord's stickers because ToS, and they're not regular images
					Patcher.after(StickersSendability, 'isSendableSticker', (_, args, returnValue) => {
						return args[0].type === StickerType.MetaStickerType.GUILD;
					});
				}

				patchStickerSuggestion() {
					// Enable suggestions for custom stickers only 
					Patcher.after(StickersSendability, 'getStickerSendability', (_, args, returnValue) => {
						if (args[0].type === StickerType.MetaStickerType.GUILD) {
							const { SENDABLE } = StickersSendability.StickerSendability;
							return returnValue !== SENDABLE ? SENDABLE : returnValue;
						}
					});
				}

				patchSendSticker() {
					// Self explanatory i believe
					Patcher.instead(MessageUtilities, 'sendStickers', (_, args, originalFunc) => {
						const [channelId, [stickerId]] = args;
						const { SENDABLE } = StickersSendability.StickerSendability;
						if (this.isStickerSendable(stickerId) == SENDABLE)
							originalFunc.apply(_, args)
						else {
							this.sendStickerAsLink(stickerId, channelId);
						}
					});
				}

				patchExpressionsPicker() {
					// Checking if shift is held to whether close the picker or not 
					// also clearing the preview
					Patcher.instead(closeExpressionPicker, 'closeExpressionPicker', (_, args, originalFunc) => {
						if (this.settings.keepStickersPopoutOpen) {
							if (this.canClosePicker) {
								originalFunc();
							}
						} else {
							originalFunc();
						}
					});
				}

				sendStickerAsLink(stickerId, channelId) {
					// Self explanatory i believe
					const stickerUrl = `https://media.discordapp.net/stickers/${stickerId}.webp?size=${this.settings.stickerSize}&passthrough=false&quality=lossless`;
					MessageUtilities.sendMessage(channelId, { content: stickerUrl, validNonShortcutEmojis: [] });
				}

				isStickerSendable(stickerId) {
					// Checking if sticker can be sent normally, Nitro / Guild's sticker
					const sticker = StickersFunctions.getStickerById(stickerId);
					const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
					return this.stickerSendability(sticker, UserStore.getCurrentUser(), channel);
				}

				setupKeyListeners() {
					document.addEventListener("keydown", this.listeners[0]);
					document.addEventListener("keyup", this.listeners[1]);
				}

				removeKeyListeners() {
					document.removeEventListener("keydown", this.listeners[0]);
					document.removeEventListener("keyup", this.listeners[1]);
				}

				patch() {
					PluginUtilities.addStyle(this.getName(), css);
					this.setupKeyListeners();
					this.patchStickerClickability();
					this.patchStickerSuggestion();
					this.patchSendSticker();
					this.patchExpressionsPicker();
					this.patchStickerPickerLoader();
					this.patchStickerAttachement();
					this.patchSticker();
				}
				clean() {
					PluginUtilities.removeStyle(this.getName());
					this.removeKeyListeners();
					Patcher.unpatchAll();
				}
				onStart() {
					try {
						this.patch();
					} catch (e) {
						console.error(e);
					}
				}

				onStop() {
					this.clean();
				}
				getSettingsPanel() { return this.buildSettingsPanel().getElement(); }
			};

		})(global.ZeresPluginLibrary.buildPlugin(config));

})();