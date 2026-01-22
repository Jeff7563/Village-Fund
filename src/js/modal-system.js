// ============================================
// CUSTOM MODAL SYSTEM
// ============================================

// Show custom alert modal
function showAlert(message, type = 'info') {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in';
    
    const iconConfig = {
        info: { icon: 'info', color: 'blue', bgColor: 'bg-blue-50', borderColor: 'border-blue-500', textColor: 'text-blue-800' },
        success: { icon: 'check-circle', color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-500', textColor: 'text-green-800' },
        warning: { icon: 'alert-triangle', color: 'orange', bgColor: 'bg-orange-50', borderColor: 'border-orange-500', textColor: 'text-orange-800' },
        error: { icon: 'x-circle', color: 'red', bgColor: 'bg-red-50', borderColor: 'border-red-500', textColor: 'text-red-800' }
    };
    
    const config = iconConfig[type] || iconConfig.info;
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-popup">
            <div class="flex items-start gap-4 mb-6">
                <div class="w-12 h-12 ${config.bgColor} rounded-full flex items-center justify-center flex-shrink-0">
                    <i data-lucide="${config.icon}" class="w-6 h-6 text-${config.color}-600"></i>
                </div>
                <div class="flex-1">
                    <h3 class="text-lg font-bold ${config.textColor} mb-2">
                        ${type.charAt(0).toUpperCase() + type.slice(1)}
                    </h3>
                    <p class="text-gray-700">${message}</p>
                </div>
            </div>
            <div class="flex justify-end">
                <button class="modal-close-btn btn btn-primary px-6">
                    OK
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
    
    const closeBtn = modal.querySelector('.modal-close-btn');
    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => modal.remove(), 300);
    };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Auto-focus OK button
    closeBtn.focus();
}

// Show custom confirm modal
function showConfirm(message, onConfirm, onCancel = null) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-popup">
            <div class="flex items-start gap-4 mb-6">
                <div class="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <i data-lucide="help-circle" class="w-6 h-6 text-blue-600"></i>
                </div>
                <div class="flex-1">
                    <h3 class="text-lg font-bold text-blue-800 mb-2">Confirm Action</h3>
                    <p class="text-gray-700">${message}</p>
                </div>
            </div>
            <div class="flex gap-3 justify-end">
                <button class="modal-cancel-btn btn btn-outline px-6">
                    Cancel
                </button>
                <button class="modal-confirm-btn btn btn-primary px-6">
                    Confirm
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
    
    const confirmBtn = modal.querySelector('.modal-confirm-btn');
    const cancelBtn = modal.querySelector('.modal-cancel-btn');
    
    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => modal.remove(), 300);
    };
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        if (onConfirm) onConfirm();
    });
    
    cancelBtn.addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            if (onCancel) onCancel();
        }
    });
    
    // Auto-focus confirm button
    confirmBtn.focus();
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.showAlert = showAlert;
    window.showConfirm = showConfirm;
}
