import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_AMBIENCE_VOLUME,
  type AcousticZone,
  type AudioPoint,
  type ReverbCharacter,
  type UploadListItem,
} from '@audioworld/shared';
import { api } from '../api';
import { ZonePreview, type TestSound } from '../services/zonePreview';
import ConfirmButton from './ConfirmButton';
import { clipName, effectiveKind, isAudio, type Kind } from './SoundLibrary';

const REVERBS: ReverbCharacter[] = ['outdoor', 'room', 'hall', 'cathedral', 'tunnel'];

/** Library clips grouped for the picker — sound effects first, as that's what beds are. */
const CLIP_GROUPS: { kind: Kind; label: string }[] = [
  { kind: 'sfx', label: 'Sound effects' },
  { kind: 'other', label: 'Other clips' },
  { kind: 'voice', label: 'Voices' },
];

type Source = 'library' | 'upload' | 'link';

/**
 * Where a zone's background loop comes from: a clip in the sound library, a new upload
 * (which joins the library), or a link to audio hosted elsewhere.
 */
function AmbiencePicker({
  url,
  clips,
  onPick,
  onUploaded,
}: {
  url: string | undefined;
  clips: UploadListItem[];
  onPick: (url: string | undefined) => void;
  onUploaded: () => void;
}) {
  const [source, setSource] = useState<Source>(() =>
    url && !url.startsWith('/uploads/') ? 'link' : 'library'
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A clip the list doesn't hold (yet): a fresh upload before the reload, or a link.
  const unlisted = url && !clips.some((c) => c.url === url) ? url : null;

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadAudio(file);
      onPick(res.url);
      onUploaded();
      setSource('library');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="zone-row__wet">
      background loop
      <div className="seg">
        {(['library', 'upload', 'link'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={source === k ? 'active' : ''}
            onClick={() => setSource(k)}
          >
            {k === 'library' ? 'Library' : k === 'upload' ? 'Upload' : 'Link'}
          </button>
        ))}
      </div>
      {source === 'library' ? (
        <select
          className="select"
          value={url ?? ''}
          onChange={(e) => onPick(e.currentTarget.value || undefined)}
        >
          <option value="">— None —</option>
          {unlisted && <option value={unlisted}>{unlisted.split('/').pop()}</option>}
          {CLIP_GROUPS.map(({ kind, label }) => {
            const group = clips.filter((c) => effectiveKind(c) === kind);
            return group.length === 0 ? null : (
              <optgroup key={kind} label={label}>
                {group.map((c) => (
                  <option key={c.url} value={c.url}>
                    {clipName(c)}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      ) : source === 'upload' ? (
        <div className="upload">
          <input
            type="file"
            accept="audio/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void upload(f);
            }}
          />
          {uploading && <span className="muted">Uploading…</span>}
        </div>
      ) : (
        <input
          className="input"
          placeholder="https://…/loop.mp3"
          value={url ?? ''}
          onChange={(e) => onPick(e.currentTarget.value || undefined)}
        />
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

interface Props {
  zones: AcousticZone[];
  /** The course's points — any of them can be the test sound in a zone preview. */
  points: AudioPoint[];
  drawing: boolean;
  draftLen: number;
  saving: boolean;
  /** True when local zones differ from the saved course zones (drives the Save button). */
  dirty: boolean;
  onNew: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onUpdate: (i: number, patch: Partial<AcousticZone>) => void;
  onDelete: (i: number) => void;
  onSave: () => void;
}

/** Author acoustic zones: draw a polygon on the map, then pick reverb + ambient bed (and its level). */
export default function ZonePanel({
  zones,
  points,
  drawing,
  draftLen,
  saving,
  dirty,
  onNew,
  onFinish,
  onCancel,
  onUpdate,
  onDelete,
  onSave,
}: Props) {
  // The sound library, for picking a background loop (re-read after an upload).
  const [clips, setClips] = useState<UploadListItem[]>([]);
  const loadClips = useCallback(() => {
    api
      .listUploads()
      .then((u) => setClips(u.filter((c) => isAudio(c.filename))))
      .catch(() => setClips([]));
  }, []);
  useEffect(loadClips, [loadClips]);

  // Preview one zone at a time: its background + a test sound through its reverb.
  const previewRef = useRef<ZonePreview | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [testKey, setTestKey] = useState('clap'); // 'clap' | 'none' | a point id
  const playable = points.filter((p) => p.audio.url.trim());
  const testSound = (key: string): TestSound => {
    const p = playable.find((pp) => pp.id === key);
    return p ? { point: p } : key === 'none' ? 'none' : 'clap';
  };
  const stopPreview = () => {
    previewRef.current?.dispose();
    previewRef.current = null;
    setPreviewId(null);
  };
  const togglePreview = (z: AcousticZone) => {
    const same = previewId === z.id;
    stopPreview();
    if (same) return;
    const preview = new ZonePreview(); // in the click: browsers only start audio on a gesture
    preview.setZone(z);
    preview.setTestSound(testSound(testKey));
    previewRef.current = preview;
    setPreviewId(z.id);
  };
  // Edits to the previewed zone play live; deleting it ends the preview.
  useEffect(() => {
    if (!previewId) return;
    const z = zones.find((zz) => zz.id === previewId);
    if (z) previewRef.current?.setZone(z);
    else stopPreview();
  }, [zones, previewId]);
  useEffect(() => () => previewRef.current?.dispose(), []);

  return (
    <section className="section">
      <div className="section-title">
        Acoustic zones ({zones.length})
        {dirty && <span className="section-head__badge">· unsaved</span>}
      </div>

      {drawing ? (
        <div className="geo-status">
          <span>
            {draftLen} corner{draftLen === 1 ? '' : 's'} · click the map, then finish (need 3+)
          </span>
          <span className="row-actions">
            <button type="button" className="btn btn-accent small" onClick={onFinish} disabled={draftLen < 3}>
              Finish
            </button>
            <button type="button" className="btn btn-ghost small" onClick={onCancel}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost small" onClick={onNew}>
          + Draw a zone
        </button>
      )}

      {zones.map((z, i) => (
        <div key={z.id} className="zone-row">
          <div className="zone-row__head">
            <input
              className="input"
              value={z.name}
              onChange={(e) => onUpdate(i, { name: e.currentTarget.value })}
            />
            <select
              className="select"
              value={z.reverb}
              onChange={(e) => onUpdate(i, { reverb: e.currentTarget.value as ReverbCharacter })}
            >
              {REVERBS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className="zone-row__wet">
            reverb {Math.round(z.wet * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={z.wet}
              onChange={(e) => onUpdate(i, { wet: e.currentTarget.valueAsNumber })}
            />
          </label>
          <AmbiencePicker
            url={z.ambienceUrl}
            clips={clips}
            onPick={(ambienceUrl) => onUpdate(i, { ambienceUrl })}
            onUploaded={loadClips}
          />
          {z.ambienceUrl && (
            <label className="zone-row__wet">
              ambience volume {Math.round((z.ambienceVolume ?? DEFAULT_AMBIENCE_VOLUME) * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={z.ambienceVolume ?? DEFAULT_AMBIENCE_VOLUME}
                onChange={(e) => onUpdate(i, { ambienceVolume: e.currentTarget.valueAsNumber })}
              />
            </label>
          )}
          <div className="zone-row__actions">
            <button
              type="button"
              className={`btn small ${previewId === z.id ? 'btn-accent' : 'btn-ghost'}`}
              onClick={() => togglePreview(z)}
            >
              {previewId === z.id ? '■ Stop preview' : '▶ Preview'}
            </button>
            <ConfirmButton className="btn btn-danger small" onConfirm={() => onDelete(i)}>
              Delete zone
            </ConfirmButton>
          </div>
          {previewId === z.id && (
            <label className="zone-row__wet">
              test sound, through the zone's reverb
              <select
                className="select"
                value={testKey}
                onChange={(e) => {
                  const key = e.currentTarget.value;
                  setTestKey(key);
                  previewRef.current?.setTestSound(testSound(key));
                }}
              >
                <option value="clap">Hand clap</option>
                {playable.length > 0 && (
                  <optgroup label="This course's sounds">
                    {playable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="none">None — background only</option>
              </select>
            </label>
          )}
        </div>
      ))}

      {dirty && (
        <button type="button" className="btn btn-accent" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save zone changes'}
        </button>
      )}
    </section>
  );
}
