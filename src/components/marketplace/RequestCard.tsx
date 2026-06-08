'use client';

import { motion } from 'framer-motion';
import { Clock, CheckCircle2, XCircle, Loader2, Package, MessageSquare, ArrowRight } from 'lucide-react';

interface RequestUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface ServiceInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  creator: RequestUser;
}

interface ServiceRequest {
  id: string;
  serviceId: string;
  buyerId: string;
  creatorId: string;
  message: string;
  status: string;
  price: number;
  deliveryMessage: string | null;
  createdAt: string;
  updatedAt: string;
  service: ServiceInfo;
  buyer: RequestUser;
  creator: RequestUser;
}

interface RequestCardProps {
  request: ServiceRequest;
  currentUserId: string;
  onUpdateStatus: (requestId: string, status: string, deliveryMessage?: string) => Promise<boolean>;
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string; icon: typeof Clock }> = {
  pending: { color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20', label: 'Pending', icon: Clock },
  accepted: { color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', label: 'Accepted', icon: CheckCircle2 },
  in_progress: { color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20', label: 'In Progress', icon: Loader2 },
  delivered: { color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', label: 'Delivered', icon: Package },
  completed: { color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', label: 'Completed', icon: CheckCircle2 },
  cancelled: { color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20', label: 'Cancelled', icon: XCircle },
};

export function RequestCard({ request, currentUserId, onUpdateStatus }: RequestCardProps) {
  const isCreator = request.creatorId === currentUserId;
  const isBuyer = request.buyerId === currentUserId;
  const otherUser = isCreator ? request.buyer : request.creator;
  const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const priceInTk = (request.price / 100).toFixed(0);

  const handleStatusUpdate = async (status: string) => {
    await onUpdateStatus(request.id, status);
  };

  const handleDeliver = async () => {
    const deliveryMessage = prompt('Enter delivery message (optional):') || 'Your service has been delivered!';
    await onUpdateStatus(request.id, 'delivered', deliveryMessage);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#1A1A1A] rounded-xl border border-white/10 p-4 space-y-3"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-semibold text-sm truncate">{request.service.title}</h4>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
              {otherUser.displayName?.[0] || otherUser.username[0]}
            </div>
            <span className="text-gray-400 text-xs truncate">
              {isCreator ? `from ${otherUser.displayName || otherUser.username}` : `by ${otherUser.displayName || otherUser.username}`}
            </span>
          </div>
        </div>

        {/* Status badge */}
        <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold border flex items-center gap-1 ${statusConfig.bgColor} ${statusConfig.color}`}>
          <StatusIcon className={`w-3 h-3 ${request.status === 'in_progress' ? 'animate-spin' : ''}`} />
          {statusConfig.label}
        </span>
      </div>

      {/* Message */}
      <div className="flex items-start gap-2 p-2.5 bg-white/5 rounded-lg">
        <MessageSquare className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
        <p className="text-gray-300 text-xs leading-relaxed line-clamp-2">{request.message}</p>
      </div>

      {/* Delivery message */}
      {request.deliveryMessage && (
        <div className="flex items-start gap-2 p-2.5 bg-green-500/5 border border-green-500/20 rounded-lg">
          <Package className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
          <p className="text-green-300 text-xs leading-relaxed">{request.deliveryMessage}</p>
        </div>
      )}

      {/* Price and date */}
      <div className="flex items-center justify-between">
        <span className="text-amber-400 font-bold text-sm">{priceInTk} TK</span>
        <span className="text-gray-600 text-[10px]">
          {new Date(request.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Action buttons */}
      {request.status !== 'completed' && request.status !== 'cancelled' && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          {isCreator && request.status === 'pending' && (
            <>
              <button
                onClick={() => handleStatusUpdate('accepted')}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                Accept
              </button>
              <button
                onClick={() => handleStatusUpdate('cancelled')}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-red-400 text-xs font-semibold rounded-lg border border-white/10 transition-all flex items-center justify-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                Reject
              </button>
            </>
          )}
          {isCreator && request.status === 'accepted' && (
            <button
              onClick={() => handleStatusUpdate('in_progress')}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
            >
              <ArrowRight className="w-3 h-3" />
              Start Work
            </button>
          )}
          {isCreator && request.status === 'in_progress' && (
            <button
              onClick={handleDeliver}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
            >
              <Package className="w-3 h-3" />
              Deliver
            </button>
          )}
          {isBuyer && request.status === 'delivered' && (
            <button
              onClick={() => handleStatusUpdate('completed')}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              Confirm Delivery
            </button>
          )}
          {isBuyer && (request.status === 'pending' || request.status === 'accepted') && (
            <button
              onClick={() => handleStatusUpdate('cancelled')}
              className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-red-400 text-xs font-semibold rounded-lg border border-white/10 transition-all flex items-center justify-center gap-1"
            >
              <XCircle className="w-3 h-3" />
              Cancel
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
