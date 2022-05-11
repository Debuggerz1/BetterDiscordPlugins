/**
	* @name FreeStickers
	* @displayName FreeStickers
	* @description Enables you to send custom stricks without nitro as links, (custom stickers as in the ones that are added by servers, not officiel discord stickers).
	* @version 1.0.0
	* @authorId Unknown
	*/


const config = {
	info: {
		"name": "FreeStickers",
		"authors": [{
			"name": "Unknown",
		}],
		"version": "1.0.0",
		"description": "Enables you to send custom stricks without nitro as links, (custom stickers as in the ones that are added by servers, not officiel discord stickers)."
	},
	changelog: [],
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
		type: 'switch',
		id: 'preview',
		name: 'Show preview',
		value: true
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
			const ExpressionPickerInspector = WebpackModules.find(e => e.default.displayName === "ExpressionPickerInspector");
			const css = `
			.stickersPreview:not(:empty){
				background:#222;
				position:absolute;
				width:500px;
				height:500px;
				z-index:654654;
			}

			.stickersPreview > img {
				height: 100% !important;
				width: 100% !important;
			}`;

			const ReactionPopout = WebpackModules.getByProps("isSelected");

			return class FreeStickers extends Plugin {
				constructor() {
					super();
					// saving this because it's needed to check if sticker is able to be sent normally
					this.stickerSendability = StickersSendability.getStickerSendability;
					this.canClosePicker = true
					this.listeners = [
						(e) => this.canClosePicker = !(e.keyCode === 16),
						(e) => this.canClosePicker = true,
						(e) => this.previewElement.innerHTML = ""
					]
				}

				patchReactionPopout() {
					// Reaction pickers has PickerInspector which trigers the preview 
					// But it doesn't call closeExpressionPicker because a subcomponent is being used
					// must do it manually
					Patcher.after(ReactionPopout, 'default', (_, args, ret) => {
						if (!ret.popouts.emojiPicker && ret.selected)
							this.clearPreviewElement();
					})
				}

				patchExpressionPickerInspector() {
					// Ptching the inspector component (the little pic at the bottom  instead of listening for stickers's hover events) to create a preview
					Patcher.after(ExpressionPickerInspector, 'default', (_, args, ret) => {
						if (!this.settings.preview) return;
						const media = args[0].graphicPrimary.props;
						if (media.sticker) {
							const { sticker } = media;
							if (sticker.type === 2) // For Stickers
								this.previewElement.innerHTML = `<img src="https://media.discordapp.net/stickers/${sticker.id}.webp" />`
						} else if (media.src) { // For Emojis
							this.previewElement.innerHTML = `<img src="${media.src.split('?')[0]}" />`;
						}
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
						const sticker = StickersFunctions.getStickerById(stickerId);
						const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
						const isStickerAvailable = this.stickerSendability(sticker, UserStore.getCurrentUser(), channel);
						const { SENDABLE } = StickersSendability.StickerSendability;
						if (isStickerAvailable == SENDABLE)
							originalFunc.apply(_, args)
						else {
							const stickerUrl = `https://media.discordapp.net/stickers/${stickerId}.webp?size=${this.settings.stickerSize}&quality=lossless`;
							MessageUtilities.sendMessage(channelId, { content: stickerUrl, validNonShortcutEmojis: [] });
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
								this.clearPreviewElement();
							}
						} else {
							originalFunc();
							this.clearPreviewElement();
						}
					});
				}

				setupPreviewElement() {
					this.previewElement = document.createElement('div');
					this.previewElement.setAttribute('class', 'stickersPreview');
					document.body.appendChild(this.previewElement);
				}

				clearPreviewElement() {
					this.previewElement.innerHTML = "";
				}

				setupKeyListeners() {

					document.addEventListener("keydown", this.listeners[0]);
					document.addEventListener("keyup", this.listeners[1]);
					document.addEventListener("click", this.listeners[2]);
				}

				removeKeyListeners() {
					if (this.listeners && this.listeners[1]) {
						document.removeEventListener("keydown", this.listeners[0]);
						document.removeEventListener("keyup", this.listeners[1]);
						document.removeEventListener("click", this.listeners[2]);
						this.canClosePicker = true;
					}
				}

				patch() {
					PluginUtilities.addStyle(this.getName(), css);
					this.setupKeyListeners();
					this.setupPreviewElement();
					this.patchExpressionPickerInspector();
					this.patchStickerClickability();
					this.patchStickerSuggestion();
					this.patchSendSticker();
					this.patchExpressionsPicker();
					this.patchReactionPopout();
				}

				onStart() {
					try {
						this.patch();
					} catch (e) {
						console.error(e);
					}
				}

				onStop() { this.clean(); }

				clean() {
					Patcher.unpatchAll();
					PluginUtilities.removeStyle(this.getName());
					document.body.removeChild(this.previewElement);
					this.removeKeyListeners();
				}

				getSettingsPanel() { return this.buildSettingsPanel().getElement(); }
			};

		})(global.ZeresPluginLibrary.buildPlugin(config));

})();