import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Clock, Users, Video, FileText, MapPin, Bell, Eye, X } from 'lucide-react';
import { useCalendarStore, type CalendarEvent } from '@/stores/useCalendarStore';

interface EventEditFormProps {
  event: CalendarEvent;
}

export function EventEditForm({ event }: EventEditFormProps) {
  const { updateEvent, deleteEvent, setEditingEventId, closeEditingEvent } = useCalendarStore();
  const [title, setTitle] = useState(event.title);

  useEffect(() => {
    setTitle(event.title);
  }, [event.title]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    updateEvent(event.id, { title: newTitle });
  };

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  const formatDuration = () => {
    if (durationHours > 0 && durationMinutes > 0) return `${durationHours}小时${durationMinutes}分钟`;
    if (durationHours > 0) return `${durationHours}小时`;
    return `${durationMinutes}分钟`;
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">活动</span>
          <button onClick={closeEditingEvent} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded">
            <X className="size-4 text-zinc-400" />
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="添加标题"
          className="w-full bg-zinc-100 dark:bg-zinc-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden p-4 space-y-4">
        {/* Time */}
        <div className="flex items-start gap-3">
          <Clock className="size-4 text-zinc-400 mt-0.5" />
          <div>
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              {format(startDate, 'h:mm a').toUpperCase()}
              <span className="mx-2 text-zinc-400">→</span>
              {format(endDate, 'h:mm a').toUpperCase()}
              <span className="ml-2 text-zinc-400">{formatDuration()}</span>
            </div>
            <div className="text-sm text-zinc-500 mt-1">{format(startDate, 'M月d日 EEEE', { locale: zhCN })}</div>
            <div className="flex gap-4 mt-2 text-xs text-zinc-400">
              <button className="hover:text-zinc-600">全天</button>
              <button className="hover:text-zinc-600">时区</button>
              <button className="hover:text-zinc-600">重复</button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Users className="size-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">参与者</span>
        </div>

        <div className="flex items-center gap-3">
          <Video className="size-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">线上会议</span>
        </div>

        <div className="flex items-center gap-3">
          <FileText className="size-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">AI通话和文档</span>
        </div>

        <div className="flex items-center gap-3">
          <MapPin className="size-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">地点</span>
        </div>

        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="text-xs text-zinc-400 mb-2">描述</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-sm text-zinc-500">默认日历</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-zinc-400">
          <span>繁忙</span>
          <div className="flex items-center gap-2">
            <Eye className="size-4" />
            <span>默认可见</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Bell className="size-4 text-zinc-400" />
          <span className="text-sm text-zinc-400">30分钟前</span>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
        <button onClick={() => { deleteEvent(event.id); setEditingEventId(null); }} className="text-sm text-red-500 hover:text-red-600">
          删除
        </button>
        <button 
          onClick={closeEditingEvent}
          className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          完成
        </button>
      </div>
    </div>
  );
}
