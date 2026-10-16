// Joins the segments of one take into one MP4 (docs/BLOCKERS.md B-1, docs/release/CAMERA-FLIP.md).
//
// Media3 Transformer with a Composition of one sequence: the segments in order, re-encoded, because
// segments from different cameras do not share codec parameters and MediaMuxer cannot join them.
// Every segment is drawn upright into the first segment's frame (Presentation, scale to fit), so the
// first segment's orientation and size are kept; CameraX writes the front camera's mirroring into
// the pixels, so it stays as recorded. Output: H.264 at the recording bitrate (2.5 Mbps,
// RECORDING_SETTINGS) and AAC, written by Media3's in-app MP4 muxer, which reserves room for the
// moov box at the start of the file (fast start).
package app.shortcut.videostitcher

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.InAppMp4Muxer
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

class StitchInputException(detail: String) :
  CodedException("ERR_STITCH_INPUT", "A segment cannot be read: $detail", null)

class StitchExportException(detail: String, cause: Throwable? = null) :
  CodedException("ERR_STITCH_EXPORT", "The segments could not be joined: $detail", cause)

class VideoStitcherModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoStitcher")

    AsyncFunction("stitch") { uris: List<String>, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(StitchExportException("no context"))
        return@AsyncFunction
      }
      val inputs: List<File>
      try {
        inputs = uris.map { inputFile(it) }
      } catch (e: CodedException) {
        promise.reject(e)
        return@AsyncFunction
      }
      // Transformer is built, started and reports on one looper thread.
      Handler(Looper.getMainLooper()).post {
        VideoStitcher(context.applicationContext).stitch(inputs, promise)
      }
    }
  }

  private fun inputFile(uri: String): File {
    val parsed = Uri.parse(uri)
    val path = if (parsed.scheme == null || parsed.scheme == "file") parsed.path else null
    val file = path?.let { File(it) } ?: throw StitchInputException(uri)
    if (!file.isFile || file.length() == 0L) throw StitchInputException(file.name)
    return file
  }
}

@OptIn(UnstableApi::class)
private class VideoStitcher(private val context: Context) {
  companion object {
    /** RECORDING_SETTINGS.videoBitrate in app/src/video/types.ts. */
    const val VIDEO_BITRATE = 2_500_000
  }

  fun stitch(inputs: List<File>, promise: Promise) {
    if (inputs.isEmpty()) {
      promise.reject(StitchInputException("no segments"))
      return
    }
    val output: File
    val composition: Composition
    try {
      val (width, height) = uprightSize(inputs.first())
      val frame = Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT)
      val items = inputs.map { file ->
        EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(file)))
          .setEffects(Effects(listOf(), listOf(frame)))
          .build()
      }
      // Audio and video declared for the whole sequence: one continuous audio track, with silence
      // for a segment that has no sound. (Media3 1.9's replacement for experimentalSetForceAudioTrack,
      // which throws when the track types are given.)
      val sequence = EditedMediaItemSequence.Builder(setOf(C.TRACK_TYPE_AUDIO, C.TRACK_TYPE_VIDEO))
        .addItems(items)
        .build()
      composition = Composition.Builder(sequence).build()
      val dir = File(context.cacheDir, "VideoStitcher").apply { mkdirs() }
      output = File(dir, "${UUID.randomUUID()}.mp4")
    } catch (e: CodedException) {
      promise.reject(e)
      return
    } catch (e: Exception) {
      promise.reject(StitchExportException(e.message ?: e.javaClass.simpleName, e))
      return
    }

    val encoderFactory = DefaultEncoderFactory.Builder(context)
      .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(VIDEO_BITRATE).build())
      .setEnableFallback(true)
      .build()

    val transformer = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .setEncoderFactory(encoderFactory)
      .setMuxerFactory(InAppMp4Muxer.Factory())
      .setLooper(Looper.getMainLooper())
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          if (output.isFile && output.length() > 0L) {
            promise.resolve(Uri.fromFile(output).toString())
          } else {
            output.delete()
            promise.reject(StitchExportException("the file is empty"))
          }
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          output.delete()
          val code = exportException.errorCodeName
          // 2xxx: reading a segment failed; a segment in a format the phone cannot decode.
          val inputError = exportException.errorCode in 2000..2999 ||
            exportException.errorCode == ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED
          promise.reject(
            if (inputError) StitchInputException(code) else StitchExportException(code, exportException),
          )
        }
      })
      .build()

    try {
      transformer.start(composition, output.absolutePath)
    } catch (e: Exception) {
      output.delete()
      promise.reject(StitchExportException(e.message ?: e.javaClass.simpleName, e))
    }
  }

  /** The first segment's size as shown (rotation applied), rounded down to even for the encoder. */
  private fun uprightSize(file: File): Pair<Int, Int> {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(file.absolutePath)
      val w = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
      val h = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
      val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      if (w == null || h == null || w <= 0 || h <= 0) throw StitchInputException("${file.name} has no video")
      val (width, height) = if (rotation % 180 != 0) h to w else w to h
      return (width - width % 2) to (height - height % 2)
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw StitchInputException("${file.name}: ${e.message}")
    } finally {
      retriever.release()
    }
  }
}
