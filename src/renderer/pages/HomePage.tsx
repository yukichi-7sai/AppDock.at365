import { useEffect, useRef, useState } from 'react';
import type { HomePageModel, HostPageModel } from '../../shared/host-pages';
import { Icon } from '../../shared/ui-icons';
import './home.css';
const api = window.dock.pages;
const states = {
  waiting: '開始待ち',
  running: '実行中',
  stopped: '停止中',
  starting: '起動中',
  stopping: '停止処理中',
  error: 'エラー',
};
export function HomePage({ initialModel }: { initialModel: HomePageModel }) {
  const [model, setModel] = useState<HomePageModel>(initialModel);
  const [error, setError] = useState('');
  const latest = useRef<HomePageModel | undefined>(initialModel);
  useEffect(() => {
    const live = true;
    const accept = (next: HostPageModel) => {
      if (live && next.kind === 'home') {
        if (latest.current?.id === next.id && latest.current.revision > next.revision) return;
        latest.current = next;
        setModel(next);
      }
    };
    accept(initialModel);
  }, [initialModel]);

  const act = (actionId: string) => {
    if (!model) return;
    setError('');
    void api.act({ id: model.id, type: 'invoke', actionId }).catch((e) => setError(String(e)));
  };
  if (!model) return error ? <p role="alert">{error}</p> : null;
  const content = model.content;
  return (
    <section className="home-page">
      {(error || content.error) && <p role="alert">{error || content.error}</p>}

      <div className="page-heading">
        <h1>ホーム</h1>
      </div>
      <div className="stats">
        <div>
          <span className="stat-icon green">
            <Icon name="play" />
          </span>
          <div>
            <span>実行中のApplet</span>
            <strong>
              {content.stats.running}
              <small> / {content.stats.applets}</small>
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-icon blue">
            <Icon name="command" />
          </span>
          <div>
            <span>使えるコマンド</span>
            <strong>{content.stats.commands}</strong>
          </div>
          <button onClick={() => act(content.actions.palette)} aria-label="コマンド一覧">
            <Icon name="arrow" />
          </button>
        </div>
        <div>
          <span className="stat-icon purple">
            <Icon name="logs" />
          </span>
          <div>
            <span>エラーのApplet</span>
            <strong>{content.stats.errors}</strong>
          </div>
          <button aria-label="ログを開く" onClick={() => act(content.actions.logs)}>
            <Icon name="arrow" />
          </button>
        </div>
      </div>
      <section className="home-pins" aria-label="よく使うコマンド">
        <h2>よく使うコマンド</h2>
        <div className="actions">
          {content.pins.map((c) => (
            <button
              key={c.id}
              className="secondary"
              disabled={content.busy || !c.available}
              title={c.disabledReason}
              onClick={() => act(c.actionId)}
            >
              {c.title}
              <small className="command-id" title={c.extension}>
                {c.id}
              </small>
            </button>
          ))}
        </div>
        {!content.pins.length && <p>コマンド検索の☆から、よく使う操作をピン留めできます。</p>}
      </section>
      <div className="section-heading">
        <h3>
          Applet<span>{content.stats.applets}</span>
        </h3>
        <button className="text-button" onClick={() => act(content.actions.applets)}>
          すべて見る
          <Icon name="arrow" size={14} />
        </button>
      </div>
      <div className="extension-grid">
        {content.applets.map((e) => (
          <button className="extension-card" key={e.id} onClick={() => act(e.actionId)}>
            <div className="card-top">
              <span className={`extension-icon ${e.runtime}`}>
                <Icon name={e.runtime === 'node' ? 'command' : 'extensions'} size={23} />
              </span>
              <span className={`state ${e.state}`}>
                <i />
                {states[e.state]}
              </span>
            </div>
            <h3>{e.title}</h3>
            <p>{e.description}</p>
            <div className="card-bottom">
              <span>
                {!!e.collection ? 'Appletページ' : e.runtime === 'node' ? 'TypeScript' : '.NET 10'}
                <span className="divider">/</span>v{e.version}
              </span>
              <Icon name="arrow" size={16} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
