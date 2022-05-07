/**
	* @name FreeStickers
	* @displayName FreeStickers
	* @description Enables you to send custom stricks without nitro as links, (custom stickers as in the ones that are added by servers, not officiel discord stickers).
	* @version 0.0.1
	* @authorId Unknown
	*/


const config = {
	info: {
		"name": "FreeStickers",
		"authors": [{
			"name": "Unknown",
		}],
		"version": "0.0.1",
		"description": "Send Stricks without Nitro."
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
	},{
		type: 'switch',
		id: 'keepStickersPopoutOpen',
		name: 'Holding shift keeps stickers menu open',
		note: 'This functionally has a great chancing of breaking due to other plugins overriding it.',
		value: true
	},{
		type: 'switch',
		id: 'preview',
		name: 'Show preview',
		value: true
	}]
};


module.exports = (()=>{
	return !global.ZeresPluginLibrary ? class {
		constructor() { this._config = config; }
		load() {
			BdApi.showConfirmationModal('Library plugin is needed',
				[`**ZeresPluginLibrary** is needed to run **${config.info.name}**.`,`Please download it from the officiel website`,'https://betterdiscord.app/plugin/ZeresPluginLibrary'], {
				confirmText: 'Ok'
			});
		}
		start() { }
		stop() { }
	}
	:
	(([Plugin, Api]) => {
		const {
				Patcher,
				WebpackModules,
				PluginUtilities,
				DiscordModules:{
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

			.stickersPreview>img{
				height: 100% !important;
				width: 100% !important;
			}
		`;
		return class FreeStickers extends Plugin {
			constructor() {
				super();
				this.checkIfCanSend = StickersSendability.getStickerSendability;
			}

			patchExpressionPickerInspector(){
				Patcher.after(ExpressionPickerInspector,'default',(_,args,ret)=>{
					if(!this.settings.preview) return;
					const media = args[0].graphicPrimary.props;
					if(media.sticker){
						const { sticker } = media;
						if(sticker.type === 2)
							this.previewElement.innerHTML = `<img src="https://media.discordapp.net/stickers/${sticker.id}.webp" />`
					} else if(media.src){
						this.previewElement.innerHTML = `<img src="${media.src.split('?')[0]}" />`;
					}
				})
			}

			patchStickerSendability(){
				Patcher.after(StickersSendability, 'isSendableSticker', (_, args, returnValue) => {
					return args[0].type === StickerType.MetaStickerType.GUILD;
				});
				
				Patcher.after(StickersSendability, 'getStickerSendability', (_, args, returnValue) => {
					if(args[0].type === StickerType.MetaStickerType.GUILD){
						const { SENDABLE } = StickersSendability.StickerSendability;
						return returnValue !== SENDABLE ? SENDABLE : returnValue;
					}
				});
			}
			

			patchSendStickers(){
				// Send stickers as links
				Patcher.instead(MessageUtilities, 'sendStickers', (_, args, originalFunc) => {
					const [channelId,[stickerId]] = args;
					const sticker = StickersFunctions.getStickerById(stickerId);
					const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
					const isStickerAvailable = this.checkIfCanSend(sticker,UserStore.getCurrentUser(),channel);
					const { SENDABLE } = StickersSendability.StickerSendability;
					console.log(isStickerAvailable);
					if (isStickerAvailable == SENDABLE)
						originalFunc.apply(_, args)
					else {
						const stickerUrl = `https://media.discordapp.net/stickers/${stickerId}.webp?size=${this.settings.stickerSize}&quality=lossless`;
						MessageUtilities.sendMessage(channelId, { content: stickerUrl , validNonShortcutEmojis: []});
					}
				});
			}

			patchExpressionsPicker(){
				this.setupKeyListeners();
				// Don't close sticker popout
				Patcher.instead(closeExpressionPicker, 'closeExpressionPicker', (_, args, originalFunc) => {
					this.previewElement.innerHTML = "";
					if(this.settings.keepStickersPopoutOpen){
						if (this.canClosePicker)
							originalFunc();
					}
					else
						originalFunc();
				});
			}

			setupPreviewElement(){
				this.previewElement = document.createElement('div');
				this.previewElement.setAttribute('class','stickersPreview');
				document.body.appendChild(this.previewElement);
			}

			setupKeyListeners(){
				this.canClosePicker = true
				this.listeners = [
					(e) => this.canClosePicker = !(e.keyCode === 16),
					(e) => this.canClosePicker = true,
					(e) => this.previewElement.innerHTML = ""
				]
				document.addEventListener("keydown", this.listeners[0]);
				document.addEventListener("keyup", this.listeners[1]);
				document.addEventListener("click", this.listeners[2]);
			}

			removeKeyListeners(){
				if(this.listeners && this.listeners[1]){
					document.removeEventListener("keydown", this.listeners[0]);
					document.removeEventListener("keyup", this.listeners[1]);
					document.removeEventListener("click", this.listeners[2]);
					this.canClosePicker = true;
				}
			}

			patch() {
				PluginUtilities.addStyle(this.getName(), css);
				this.setupPreviewElement();
				this.patchExpressionPickerInspector();
				this.patchStickerSendability();
				this.patchSendStickers();
				this.patchExpressionsPicker();
			}

			onStart() {
				try {
					this.patch();
				} catch (e) {
					console.error(e);
				}
			}

			onStop() { this.clean(); }
			
			clean(){
				Patcher.unpatchAll();
				PluginUtilities.removeStyle(this.getName());
				document.body.removeChild(this.previewElement);
				this.removeKeyListeners();
			}

			getSettingsPanel() { return this.buildSettingsPanel().getElement(); }
		};
		
	})(global.ZeresPluginLibrary.buildPlugin(config));

})();
