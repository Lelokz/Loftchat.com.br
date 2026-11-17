import { expect, test } from "@playwright/test";

/**
 * Etapa 10c — a tela do celular, do lado da PÁGINA (sem emulador de Android).
 *
 * O Android de mentira é um plugin "Transmissao" da web: entrega o canal de
 * mensagens como o `PluginDaTransmissao.java` e manda JPEGs como o
 * `ServicoDaTransmissao.java` (um de cada vez, esperando o "ok"). Confere que
 * a página transforma isso numa faixa de vídeo de verdade, que acompanha o
 * celular girando, e que parar pelos dois lados funciona.
 */

for (const caminho of ["MediaStreamTrackGenerator", "canvas"] as const) {
  test(`tela do celular (${caminho}): JPEGs do Android viram uma faixa de vídeo; girar e parar`, async ({
    page,
  }) => {
    // WebView sem o gerador de faixa: cai no <canvas>.
    if (caminho === "canvas")
      await page.addInitScript(
        () =>
          delete (window as { MediaStreamTrackGenerator?: unknown })
            .MediaStreamTrackGenerator,
      );
    // Uma página do servidor SEM o chat (o chat já registraria o plugin de verdade).
    await page.goto("/src/lib/android-tela.ts");
    const resultado = await page.evaluate(async () => {
      // O MESMO @capacitor/core que a página usa (o Vite põe uma versão no endereço).
      const codigo = await (await fetch("/src/lib/android-tela.ts")).text();
      const endereco =
        /from ["'](\/node_modules\/\.vite\/deps\/@capacitor_core\.js[^"']*)["']/.exec(
          codigo,
        )![1]!;
      const { WebPlugin, registerPlugin } = await import(endereco);

      let respostas = 0;
      let parouPeloChat = 0;
      let porta: MessagePort | null = null;
      let portaDoSom: MessagePort | null = null;

      // Um quadro JPEG de um tamanho, com uma cor (como o Android comprime).
      const quadro = async (
        l: number,
        a: number,
        cor: string,
      ): Promise<ArrayBuffer> => {
        const c = new OffscreenCanvas(l, a);
        const g = c.getContext("2d")!;
        g.fillStyle = cor;
        g.fillRect(0, 0, l, a);
        return (
          await c.convertToBlob({ type: "image/jpeg", quality: 0.7 })
        ).arrayBuffer();
      };

      class AndroidDeMentira extends WebPlugin {
        async disponivel() {
          return { disponivel: true };
        }
        async iniciar() {
          const canal = new MessageChannel();
          porta = canal.port1;
          porta.onmessage = (e) => {
            if (e.data === "ok") respostas++;
          };
          // O som chega por um segundo canal (Android 10+).
          const canalDoSom = new MessageChannel();
          portaDoSom = canalDoSom.port1;
          window.postMessage("loft-tela", "*", [canal.port2, canalDoSom.port2]);
          return { ok: true };
        }
        async parar() {
          parouPeloChat++;
        }
        avisarParou() {
          this.notifyListeners("parou", {});
        }
      }
      const android = new AndroidDeMentira();
      registerPlugin("Transmissao", { web: android });

      const { capturarTelaDoAndroid } = await import(
        "/src/lib/android-tela.ts" as string
      );
      const fonte = await capturarTelaDoAndroid();
      const faixa: MediaStreamTrack = fonte.stream.getVideoTracks()[0];

      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = fonte.stream;
      document.body.append(video);
      void video.play();

      const esperar = async (
        cond: () => boolean,
        ms = 5000,
      ): Promise<boolean> => {
        const fim = performance.now() + ms;
        while (!cond() && performance.now() < fim)
          await new Promise((r) => setTimeout(r, 50));
        return cond();
      };

      // Em pé, depois deitado (girou o celular): o vídeo acompanha.
      porta!.postMessage(await quadro(576, 1280, "#7b3fe4"));
      const emPe = await esperar(
        () => video.videoWidth === 576 && video.videoHeight === 1280,
      );
      const antes = respostas;
      porta!.postMessage(await quadro(1280, 576, "#140f26"));
      const deitado = await esperar(
        () => video.videoWidth === 1280 && video.videoHeight === 576,
      );
      const respondeu = await esperar(() => respostas > antes);

      // O SOM: 20 ms de um tom de 440 Hz por vez, como o Android manda
      // (PCM 16 bits, estéreo, 48 kHz). A faixa de som tem que mexer.
      const faixaDoSom = fonte.stream.getAudioTracks()[0] as MediaStreamTrack | undefined;
      const temSom = faixaDoSom !== undefined;
      let nivelDoSom = 0;
      if (faixaDoSom !== undefined) {
        const ouvido = new AudioContext();
        await ouvido.resume();
        const analisador = ouvido.createAnalyser();
        ouvido.createMediaStreamSource(new MediaStream([faixaDoSom])).connect(analisador);
        const amostras = new Float32Array(analisador.fftSize);
        let t = 0;
        for (let pedaco = 0; pedaco < 40; pedaco++) {
          const pcm = new Int16Array(960 * 2);
          for (let i = 0; i < 960; i++, t++) {
            const v = Math.round(Math.sin((2 * Math.PI * 440 * t) / 48000) * 16000);
            pcm[i * 2] = v;
            pcm[i * 2 + 1] = v;
          }
          portaDoSom!.postMessage(pcm.buffer, [pcm.buffer]);
          await new Promise((r) => setTimeout(r, 20));
          analisador.getFloatTimeDomainData(amostras);
          nivelDoSom = Math.max(nivelDoSom, ...amostras.map(Math.abs));
        }
        void ouvido.close();
      }

      // Parou pelo Android (botão da notificação): a faixa avisa "ended",
      // que é o que o motor da chamada escuta.
      let terminou = false;
      faixa.addEventListener("ended", () => (terminou = true));
      android.avisarParou();
      await esperar(() => terminou);

      // O motor chama `parar`: o Android é avisado uma vez só, mesmo chamando duas.
      fonte.parar();
      fonte.parar();
      await esperar(() => parouPeloChat > 0);

      return {
        emPe,
        deitado,
        respondeu,
        terminou,
        parouPeloChat,
        superficie: fonte.surface,
        temSom,
        nivelDoSom,
        gerador: "MediaStreamTrackGenerator" in window,
        estado: faixa.readyState,
      };
    });

    expect(resultado.emPe, "o primeiro quadro (em pé) virou vídeo").toBe(true);
    expect(resultado.deitado, "girou: o vídeo acompanhou").toBe(true);
    expect(resultado.respondeu, 'a página respondeu "ok" ao Android').toBe(
      true,
    );
    expect(resultado.terminou, "parar pelo Android avisou o motor").toBe(true);
    expect(resultado.parouPeloChat).toBe(1);
    expect(resultado.superficie).toBe("celular");
    expect(resultado.temSom, "a fonte traz uma faixa de som").toBe(true);
    expect(resultado.nivelDoSom, "o som do Android chegou na faixa").toBeGreaterThan(0.05);
    expect(resultado.estado).toBe("ended");
    expect(resultado.gerador).toBe(caminho === "MediaStreamTrackGenerator");
  });
}
