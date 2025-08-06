document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const inputText = document.getElementById('inputText');
    const codeTypeRadios = document.getElementsByName('codeType');
    const generateBtn = document.getElementById('generateBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const canvasContainer = document.getElementById('canvas-container');
    const qrOptions = document.getElementById('qrOptions');
    const iconInput = document.getElementById('iconInput');

    // --- Color Input References ---
    const colorInputs = {
        bg: { picker: 'bgColor', hex: 'bgColorHex' },
        fg: { picker: 'fgColor', hex: 'fgColorHex' },
        gradient: { picker: 'gradientColor', hex: 'gradientColorHex' }
    };

    /**
     * Synchronizes a color picker with its corresponding hex input field.
     * @param {string} pickerId - The ID of the color input.
     * @param {string} hexId - The ID of the text input for the hex code.
     */
    function syncColorInputs(pickerId, hexId) {
        const picker = document.getElementById(pickerId);
        const hex = document.getElementById(hexId);

        picker.addEventListener('input', () => {
            hex.value = picker.value;
        });

        hex.addEventListener('input', () => {
            if (isValidHex(hex.value)) {
                picker.value = hex.value;
            }
        });
    }

    // Initialize color input syncing
    for (const key in colorInputs) {
        syncColorInputs(colorInputs[key].picker, colorInputs[key].hex);
    }
    
    // Toggle QR-specific options based on selected code type
    codeTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            qrOptions.style.display = radio.value === 'qr' ? 'block' : 'none';
        });
    });

    // --- Main Generate Button Logic ---
    generateBtn.addEventListener('click', () => {
        const text = inputText.value.trim();
        if (!text) {
            alert('Please enter text or URL');
            return;
        }

        const codeType = Array.from(codeTypeRadios).find(radio => radio.checked).value;
        canvasContainer.innerHTML = ''; // Clear previous output
        downloadBtn.classList.add('hidden');

        try {
            if (codeType === 'qr') {
                generateQRCode(text);
            } else {
                generateBarcode(text);
            }
            downloadBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Error generating code:', error);
            alert('Failed to generate code. Check console for details.');
        }
    });

    // --- Download Button Logic ---
    downloadBtn.addEventListener('click', () => {
        const canvas = canvasContainer.querySelector('canvas');
        if (!canvas) {
            console.error("Canvas not found for download.");
            return;
        }

        // Check if the script is running inside a Telegram Mini App
        if (window.Telegram && window.Telegram.WebApp) {
            // --- The Telegram Mini App Method ---

            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);

                // 1. Show a popup to inform the user what's happening.
                window.Telegram.WebApp.showPopup({
                    title: 'QR Code Ready',
                    message: 'You can now save the generated image to your device.',
                    buttons: [{
                        id: 'save',
                        type: 'ok',
                        text: 'Save Image'
                    }, {
                        type: 'cancel'
                    }]
                }, (buttonId) => {
                    // 2. If the user clicks the "Save Image" button, open the link.
                    if (buttonId === 'save') {
                        window.Telegram.WebApp.openLink(url);
                        // Revoke the temporary URL after a moment to allow the system to access it
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } else {
                        // If they cancel, revoke the URL immediately
                        URL.revokeObjectURL(url);
                    }
                });

            }, 'image/png');

        } else {
            // --- The Standard Browser Download Method (Fallback) ---
            console.log("Not in Telegram, using standard browser download.");
            const codeType = Array.from(codeTypeRadios).find(radio => radio.checked).value;
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `${codeType}_${Date.now()}.png`;
            link.click();
        }
    });


    /**
     * Generates a customized QR code using a multi-canvas compositing technique.
     * @param {string} text - The text to encode in the QR code.
     */
    function generateQRCode(text) {
        // 1. Get user-defined options
        const fgColor = document.getElementById('fgColor').value;
        const bgColor = document.getElementById('bgColor').value;
        const gradientColorHex = document.getElementById('gradientColorHex').value;
        const useGradient = gradientColorHex && isValidHex(gradientColorHex);
        const iconFile = iconInput.files[0];
        const size = 256;

        // 2. Create a temporary, off-screen div for the base QR code
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        document.body.appendChild(tempDiv);

        // 3. Generate a standard black & white QR code
        new QRCode(tempDiv, {
            text: text,
            width: size,
            height: size,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H // High correction for icon support
        });

        // 4. Use a short timeout to ensure the library has drawn the canvas
        setTimeout(() => {
            const qrCanvas = tempDiv.querySelector('canvas');
            if (!qrCanvas) {
                console.error('QR code canvas was not generated by the library.');
                document.body.removeChild(tempDiv);
                return;
            }

            // --- Start of new drawing logic ---

            // 5. Create the final, visible canvas and its context
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = size;
            finalCanvas.height = size;
            const finalCtx = finalCanvas.getContext('2d');

            // 6. Create a temporary canvas to hold the colored foreground
            const fgCanvas = document.createElement('canvas');
            fgCanvas.width = size;
            fgCanvas.height = size;
            const fgCtx = fgCanvas.getContext('2d');

            // 7. Create the foreground pattern (solid color or gradient) and draw it on the foreground canvas
            const fgStyle = useGradient 
                ? createGradient(fgCtx, size, size, fgColor, gradientColorHex)
                : fgColor;
            fgCtx.fillStyle = fgStyle;
            fgCtx.fillRect(0, 0, size, size);

            // 8. Use the original QR Canvas as a mask. 'destination-in' keeps the foreground canvas pixels
            // only where the original qrCanvas has opaque pixels. Since qrCanvas is solid B&W, we first
            // need to make its white parts transparent.
            const qrCtx = qrCanvas.getContext('2d');
            const qrImageData = qrCtx.getImageData(0, 0, size, size);
            const data = qrImageData.data;
            for (let i = 0; i < data.length; i += 4) {
                // If the pixel is white (a bit of tolerance)
                if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
                    data[i + 3] = 0; // Make it transparent
                }
            }
            qrCtx.putImageData(qrImageData, 0, 0);
            
            // 9. Now, apply the modified qrCanvas (with transparency) as a mask to the foreground canvas.
            fgCtx.globalCompositeOperation = 'destination-in';
            fgCtx.drawImage(qrCanvas, 0, 0);

            // 10. Draw the background color on the final canvas.
            finalCtx.fillStyle = bgColor;
            finalCtx.fillRect(0, 0, size, size);

            // 11. Draw the masked, colored foreground on top of the background.
            finalCtx.drawImage(fgCanvas, 0, 0);

            // 12. Draw the icon if one is selected
            if (iconFile) {
                drawIcon(finalCtx, finalCanvas, iconFile, bgColor);
            }

            // 13. Display the final canvas and clean up the temporary div
            canvasContainer.appendChild(finalCanvas);
            document.body.removeChild(tempDiv);

        }, 100);
    }
    
    /**
     * Draws the selected icon onto the center of the canvas.
     * @param {CanvasRenderingContext2D} ctx - The context of the final canvas.
     * @param {HTMLCanvasElement} canvas - The final canvas element.
     * @param {File} iconFile - The user-selected image file.
     * @param {string} bgColor - The background color to fill behind the icon.
     */
    function drawIcon(ctx, canvas, iconFile, bgColor) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const iconSize = canvas.width * 0.25; // Icon covers 25% of the width
                const x = (canvas.width - iconSize) / 2;
                const y = (canvas.height - iconSize) / 2;
                
                // Clear the area behind the icon with a solid background color
                // This creates a "padding" for the icon so it's clearly visible
                ctx.fillStyle = bgColor;
                ctx.fillRect(x, y, iconSize, iconSize);
                
                // Draw the icon
                ctx.drawImage(img, x, y, iconSize, iconSize);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(iconFile);
    }

    /**
     * Generates a standard barcode.
     * @param {string} text - The text to encode.
     */
    function generateBarcode(text) {
        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);
        JsBarcode(canvas, text, {
            format: 'CODE128',
            width: 2,
            height: 100,
            displayValue: true
        });
    }

    // --- Utility Functions ---
    const isValidHex = (hex) => /^#[0-9A-F]{6}$/i.test(hex);
    
    const createGradient = (ctx, width, height, start, end) => {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, start);
        gradient.addColorStop(1, end);
        return gradient;
    };
});