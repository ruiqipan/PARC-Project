'use client';

import { Room } from '@/types';
import { Badge } from '@/components/ui/badge';
import { ROOM_IMAGES } from '@/lib/seed-data';

interface RoomTypeListProps {
  rooms: Room[];
}

const TYPE_LABELS: Record<string, string> = {
  king: 'King Room',
  twin: 'Twin Room',
  family: 'Family Suite',
  accessible: 'Accessible Room',
  suite: 'Suite',
  standard: 'Standard Room',
};

export default function RoomTypeList({ rooms }: RoomTypeListProps) {
  if (rooms.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="flex gap-4 pb-2" style={{ width: 'max-content' }}>
        {rooms.map(room => (
          <div key={room.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm w-64 shrink-0">
            <div className="h-36 bg-gray-100 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={room.image_url || ROOM_IMAGES[room.type] || ROOM_IMAGES.standard}
                alt={room.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-sm text-gray-900">{room.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {TYPE_LABELS[room.type] || room.type} · Up to {room.capacity} guests
                  </p>
                </div>
                {room.price_per_night && (
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-gray-900">
                      ${Math.round(room.price_per_night / 100)}
                    </span>
                    <span className="text-xs text-gray-400">/night</span>
                  </div>
                )}
              </div>
              {room.amenities && room.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {room.amenities.slice(0, 3).map(a => (
                    <Badge key={a} variant="secondary" className="text-xs px-1.5 py-0 bg-gray-100 text-gray-500">
                      {a}
                    </Badge>
                  ))}
                  {room.amenities.length > 3 && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-gray-100 text-gray-400">
                      +{room.amenities.length - 3} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
