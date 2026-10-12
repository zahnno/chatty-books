import React, { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useSearchParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { toast } from 'react-toastify';
import { Calendar, Menu, Plus, Star, Trash2 } from 'react-feather';
import { authFetch, catchError } from '../../utils';
import ContentSelector from './ContentSelector';
import { AdminLayout, Badge, EmptyState, Field, Loading, Modal, Notice, formatDate } from './AdminUI';
import "react-datepicker/dist/react-datepicker.css";
import { thumbUrl } from '@talkingbook/shared';

const CONTENT_TYPES = [{ value: 'book', label: 'Books' }, { value: 'character', label: 'Characters' }];
const PLACEMENTS = [{ value: 'featured', label: 'Featured' }, { value: 'popular', label: 'Popular' }];

const titleOf = (content) => content?.title || [content?.firstName, content?.lastName].filter(Boolean).join(' ') || 'Missing item';

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function scheduleStatus(item) {
  const now = Date.now();
  if (item.startDate && new Date(item.startDate).getTime() > now) return { label: 'Scheduled', tone: 'warning' };
  if (item.endDate && new Date(item.endDate).getTime() < now) return { label: 'Ended', tone: 'danger' };
  return { label: 'Live', tone: 'success' };
}

function ScheduleFields({ startDate, endDate, onStart, onEnd }) {
  return (
    <div className="adm-form-row">
      <Field label="Start date">
        <DatePicker selected={startDate} onChange={onStart} selectsStart startDate={startDate} endDate={endDate} className="adm-input" dateFormat="MMM d, yyyy" />
      </Field>
      <Field label="End date" hint="Optional. Leave empty to keep it up until removed.">
        <DatePicker selected={endDate} onChange={onEnd} selectsEnd startDate={startDate} endDate={endDate} minDate={startDate} isClearable placeholderText="No end date" className="adm-input" dateFormat="MMM d, yyyy" />
      </Field>
    </div>
  );
}

function AddModal({ contentType, placement, excludeIds, nextOrder, onAdded, onClose }) {
  const [selected, setSelected] = useState(null);
  const [startDate, setStartDate] = useState(startOfToday);
  const [endDate, setEndDate] = useState(null);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    const [err] = await catchError(authFetch({
      path: '/admin/featured-content',
      method: 'POST',
      body: { contentType, contentId: selected._id, type: placement, order: nextOrder, startDate, endDate },
    }));
    setSaving(false);
    if (err) return toast.error(err.message || 'Could not add it');
    toast.success(`${titleOf(selected)} added`);
    onAdded();
  };

  return (
    <Modal title={`Add to ${placement}`} onClose={onClose} wide busy={saving}>
      <div className="adm-form">
        <ContentSelector contentType={contentType} excludeIds={excludeIds} selectedId={selected?._id} onSelect={setSelected} />
        <ScheduleFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
        <div className="adm-form-actions">
          <button type="button" className="ui-btn ui-btn-primary" onClick={add} disabled={!selected || saving}>
            {saving ? 'Adding…' : selected ? `Add ${titleOf(selected)}` : 'Pick an item above'}
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleModal({ item, onSaved, onClose }) {
  const [startDate, setStartDate] = useState(item.startDate ? new Date(item.startDate) : startOfToday());
  const [endDate, setEndDate] = useState(item.endDate ? new Date(item.endDate) : null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const [err] = await catchError(authFetch({
      path: `/admin/featured-content/${item._id}`,
      method: 'PUT',
      body: { startDate, endDate },
    }));
    setSaving(false);
    if (err) return toast.error(err.message || 'Could not update the schedule');
    toast.success('Schedule updated');
    onSaved({ ...item, startDate, endDate });
  };

  return (
    <Modal title={`Schedule ${titleOf(item.contentId)}`} onClose={onClose} busy={saving}>
      <div className="adm-form">
        <ScheduleFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
        <div className="adm-form-actions">
          <button type="button" className="ui-btn ui-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

export default function FeaturedContentManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contentType = searchParams.get('type') === 'character' ? 'character' : 'book';
  const placement = searchParams.get('contentType') === 'popular' ? 'popular' : 'featured';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState(null);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    const [err, data] = await catchError(authFetch({
      path: `/admin/featured-content?contentType=${contentType}&type=${placement}`,
    }));
    if (err) setError(err.message || 'Could not load featured content');
    setItems(data || []);
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems(); }, [contentType, placement]);

  const handleDragEnd = async ({ source, destination }) => {
    if (!destination || destination.index === source.index) return;
    const previous = items;
    const reordered = Array.from(items);
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    const updated = reordered.map((item, index) => ({ ...item, order: index }));
    setItems(updated);

    const changed = updated.filter(item => previous.find(p => p._id === item._id)?.order !== item.order);
    const results = await Promise.all(changed.map(item => catchError(authFetch({
      path: `/admin/featured-content/${item._id}`,
      method: 'PUT',
      body: { order: item.order },
    }))));
    if (results.some(([err]) => err)) {
      toast.error('Could not save the new order');
      fetchItems();
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove ${titleOf(item.contentId)} from ${placement}?`)) return;
    const [err] = await catchError(authFetch({ path: `/admin/featured-content/${item._id}`, method: 'DELETE' }));
    if (err) return toast.error(err.message || 'Could not remove it');
    setItems(prev => prev.filter(i => i._id !== item._id));
    toast.success('Removed');
  };

  const nextOrder = items.reduce((max, item) => Math.max(max, (item.order ?? 0) + 1), 0);

  return (
    <AdminLayout
      title="Featured content"
      subtitle="Choose what the home page highlights. Drag to reorder; schedule items to go live or end on a date."
      actions={<button type="button" className="ui-btn ui-btn-primary" onClick={() => setAdding(true)}><Plus size={16} />Add {contentType === 'book' ? 'book' : 'character'}</button>}
    >
      <div className="adm-toolbar">
        <div className="ui-chip-row" role="group" aria-label="Content type">
          {CONTENT_TYPES.map(t => (
            <button key={t.value} type="button" className={`ui-chip${contentType === t.value ? ' active' : ''}`} aria-pressed={contentType === t.value} onClick={() => setParam('type', t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="ui-chip-row" role="group" aria-label="Placement">
          {PLACEMENTS.map(p => (
            <button key={p.value} type="button" className={`ui-chip${placement === p.value ? ' active' : ''}`} aria-pressed={placement === p.value} onClick={() => setParam('contentType', p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Notice onRetry={fetchItems}>{error}</Notice>}

      {loading ? (
        <Loading label="Loading…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Star}
          title={`No ${placement} ${contentType === 'book' ? 'books' : 'characters'}`}
          text="Add items to control what shows in this spot."
          action={<button type="button" className="ui-btn ui-btn-primary" onClick={() => setAdding(true)}><Plus size={16} />Add</button>}
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="featured-content">
            {(provided) => (
              <div className="adm-list" ref={provided.innerRef} {...provided.droppableProps}>
                {items.map((item, index) => {
                  const status = scheduleStatus(item);
                  const content = item.contentId;
                  return (
                    <Draggable key={item._id} draggableId={item._id} index={index}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`adm-row${snapshot.isDragging ? ' is-dragging' : ''}`}
                        >
                          <span className="adm-drag" {...dragProvided.dragHandleProps} aria-label="Drag to reorder"><Menu size={16} /></span>
                          <span className="adm-order">{index + 1}</span>
                          <img className={contentType === 'book' ? 'adm-thumb' : 'adm-avatar'} src={thumbUrl(content?.image_url || '/placeholder-cover.jpg', 100)} alt="" loading="lazy" />
                          <div className="adm-row-body">
                            <p className="adm-row-title">{titleOf(content)}</p>
                            <p className="adm-row-sub">
                              {contentType === 'book' ? content?.author : content?.bookTitle}
                              {!content && 'The original item was deleted. Remove this entry.'}
                            </p>
                            <div className="adm-row-meta">
                              <Badge tone={status.tone}>{status.label}</Badge>
                              <span className="adm-hint">
                                {formatDate(item.startDate)}{item.endDate ? ` to ${formatDate(item.endDate)}` : ' onward'}
                              </span>
                            </div>
                          </div>
                          <div className="adm-row-actions">
                            <button type="button" className="adm-icon-btn" title="Edit schedule" aria-label="Edit schedule" onClick={() => setScheduling(item)}>
                              <Calendar size={16} />
                            </button>
                            <button type="button" className="adm-icon-btn danger" title="Remove" aria-label={`Remove ${titleOf(content)}`} onClick={() => remove(item)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {adding && (
        <AddModal
          contentType={contentType}
          placement={placement}
          excludeIds={items.map(i => i.contentId?._id).filter(Boolean)}
          nextOrder={nextOrder}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); fetchItems(); }}
        />
      )}

      {scheduling && (
        <ScheduleModal
          item={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={(saved) => { setItems(prev => prev.map(i => (i._id === saved._id ? saved : i))); setScheduling(null); }}
        />
      )}
    </AdminLayout>
  );
}
