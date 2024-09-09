import {
  type TEditor,
  type TSelection,
  type Value,
  createTEditor,
  getEndPoint,
  getStartPoint,
  normalizeEditor,
  select,
} from '@udecode/slate';

import type { AnyPluginConfig } from '../plugin/BasePlugin';
import type { AnySlatePlugin } from '../plugin/SlatePlugin';
import type { InferPlugins, SlateEditor, TSlateEditor } from './SlateEditor';

import { createSlatePlugin } from '../plugin/createSlatePlugin';
import { getPluginType, getSlatePlugin } from '../plugin/getSlatePlugin';
import { type CorePlugin, getCorePlugins } from '../plugins/getCorePlugins';
import { pipeNormalizeInitialValue } from '../utils/pipeNormalizeInitialValue';
import { resolvePlugins } from '../utils/resolvePlugins';

export type BaseWithSlateOptions<
  V extends Value = Value,
  P extends AnyPluginConfig = CorePlugin,
> = {
  /**
   * Select the editor after initialization.
   *
   * @default false
   *
   * - `true` | 'end': Select the end of the editor
   * - `false`: Do not select anything
   * - `'start'`: Select the start of the editor
   */
  autoSelect?: 'end' | 'start' | boolean;

  id?: any;

  /** Specifies the maximum number of characters allowed in the editor. */
  maxLength?: number;

  plugins?: P[];

  selection?: TSelection;

  /**
   * When `true`, it will normalize the initial `value` passed to the `editor`.
   * This is useful when adding normalization rules on already existing
   * content.
   *
   * @default false
   */
  shouldNormalizeEditor?: boolean;

  value?: V | string;
};

export type WithSlateOptions<
  V extends Value = Value,
  P extends AnyPluginConfig = CorePlugin,
> = {
  /** Function to configure the root plugin */
  rootPlugin?: (plugin: AnySlatePlugin) => AnySlatePlugin;
} & BaseWithSlateOptions<V, P> &
  Pick<
    Partial<AnySlatePlugin>,
    | 'api'
    | 'decorate'
    | 'extendEditor'
    | 'inject'
    | 'normalizeInitialValue'
    | 'options'
    | 'override'
    | 'transforms'
  >;

/**
 * Applies Plate enhancements to an editor instance (non-React version).
 *
 * @remarks
 *   This function supports server-side usage as it doesn't include the
 *   ReactPlugin.
 * @see {@link createSlateEditor} for a higher-level non-React editor creation function.
 * @see {@link createPlateEditor} for a higher-level React editor creation function.
 * @see {@link usePlateEditor} for a React memoized version.
 * @see {@link withPlate} for the React-specific enhancement function.
 */
export const withSlate = <
  V extends Value = Value,
  P extends AnyPluginConfig = CorePlugin,
>(
  e: TEditor,
  {
    autoSelect,
    id,
    maxLength,
    plugins = [],
    rootPlugin,
    selection,
    shouldNormalizeEditor,
    value,
    ...pluginConfig
  }: WithSlateOptions<V, P> = {}
): TSlateEditor<V, InferPlugins<P[]>> => {
  console.time('withSlate');

  const editor = e as SlateEditor;

  // Override incremental id generated by slate
  editor.id = id ?? editor.id;
  editor.key = editor.key ?? Math.random();
  editor.isFallback = false;

  editor.getApi = () => editor.api as any;
  editor.getTransforms = () => editor.transforms as any;
  editor.getPlugin = (plugin) => getSlatePlugin(editor, plugin) as any;
  editor.getType = (plugin) => getPluginType(editor, plugin);
  editor.getInjectProps = (plugin) => {
    return (
      editor.getPlugin<AnySlatePlugin>(plugin).inject?.nodeProps ?? ({} as any)
    );
  };
  editor.getOptionsStore = (plugin) => {
    return editor.getPlugin(plugin).optionsStore;
  };
  editor.getOptions = (plugin) => {
    const store = editor.getOptionsStore(plugin);

    if (!store) return editor.getPlugin(plugin).options;

    return editor.getOptionsStore(plugin).get.state();
  };
  editor.getOption = (plugin, key, ...args) => {
    const store = editor.getOptionsStore(plugin);

    if (!store) return editor.getPlugin(plugin).options[key];

    const getter = (store.get as any)[key];

    if (getter) {
      return getter(...args);
    }

    editor.api.debug.error(
      `editor.getOption: ${key as string} option is not defined in plugin ${plugin.key}.`,
      'OPTION_UNDEFINED'
    );
  };
  editor.setOption = (plugin: any, key: any, value: any) => {
    const store = editor.getOptionsStore(plugin);

    if (!store) return;

    const setter = (store.set as any)[key];

    if (setter) {
      setter(value);
    } else {
      editor.api.debug.error(
        `editor.setOption: ${key} option is not defined in plugin ${plugin.key}.`,
        'OPTION_UNDEFINED'
      );
    }
  };
  editor.setOptions = (plugin: any, options: any) => {
    const store = editor.getOptionsStore(plugin);

    if (!store) return;
    if (typeof options === 'object') {
      (store.set as any).mergeState(options);
    } else if (typeof options === 'function') {
      (store.set as any).state(options);
    }
  };

  const corePlugins = getCorePlugins({
    maxLength,
    plugins,
  });

  let rootPluginInstance = createSlatePlugin({
    key: 'root',
    priority: 10_000,
    ...pluginConfig,
    plugins: [...corePlugins, ...plugins],
  });

  // Apply rootPlugin configuration if provided
  if (rootPlugin) {
    rootPluginInstance = rootPlugin(rootPluginInstance) as any;
  }

  console.time('resolvePlugins');
  resolvePlugins(editor, [rootPluginInstance]);
  console.timeEnd('resolvePlugins');

  if (typeof value === 'string') {
    editor.children = editor.api.html.deserialize({ element: value }) as Value;
  } else if (value) {
    editor.children = value;
  }
  if (editor.children?.length === 0) {
    editor.children = editor.api.create.value();
  }
  if (selection) {
    editor.selection = selection;
  } else if (autoSelect) {
    const edge = autoSelect === 'start' ? 'start' : 'end';
    const target =
      edge === 'start' ? getStartPoint(editor, []) : getEndPoint(editor, []);
    select(editor, target);
  }
  if (value) {
    pipeNormalizeInitialValue(editor);
  }
  if (shouldNormalizeEditor) {
    console.time('normalizeEditor');
    normalizeEditor(editor, { force: true });
    console.timeEnd('normalizeEditor');
  }

  console.timeEnd('withSlate');

  return editor as any;
};

export type CreateSlateEditorOptions<
  V extends Value = Value,
  P extends AnyPluginConfig = CorePlugin,
> = {
  /**
   * Initial editor to be extended with `withPlate`.
   *
   * @default createEditor()
   */
  editor?: TEditor;
} & WithSlateOptions<V, P>;

/**
 * Creates a Slate editor without React-specific enhancements.
 *
 * @see {@link createPlateEditor} for a React-specific version of editor creation.
 * @see {@link usePlateEditor} for a memoized React version.
 * @see {@link withSlate} for the underlying function that applies Slate enhancements to an editor.
 */
export const createSlateEditor = <
  V extends Value = Value,
  P extends AnyPluginConfig = CorePlugin,
>({
  editor = createTEditor(),
  ...options
}: CreateSlateEditorOptions<V, P> = {}) => {
  return withSlate<V, P>(editor, options);
};
