import React from 'react';
interface ConfigItem {
    id: string;
    name: string;
    required: boolean;
    isSet: boolean;
    source: string;
}
interface ConfigModalProps {
    onConfigsUpdated: () => void;
    configs: ConfigItem[];
    isOpen: boolean;
    onClose: () => void;
    onShowToast: (msg: string, type: 'success' | 'error') => void;
}
declare const ConfigModal: React.FC<ConfigModalProps>;
export default ConfigModal;
//# sourceMappingURL=ConfigModal.d.ts.map